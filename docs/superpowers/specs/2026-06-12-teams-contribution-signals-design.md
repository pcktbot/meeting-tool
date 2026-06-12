# Teams Contribution Signals — Design

**Date:** 2026-06-12
**Branch:** `feature/teams-integration`
**Status:** Approved for planning

## Problem

The work diary is a manual, incomplete record of what the user actually did. The
user's own Microsoft Teams messages — sent across many chats during a day — are a
richer, lower-effort record of their real contributions, commitments, and state of
mind. Today the only way to get a Graph token for Teams is to paste one into Settings;
it expires in ~1 hour. And there is no way to turn that day's messages into something
useful for the diary beyond a naive "link this message to the first entry" button.

## Core Insight

**Only the user's *own* sent messages matter, and only for what they reveal about the
user — not the surrounding conversation.** The user does not care about other people's
replies or about reconstructing threads. Their scattered sent messages are a record of
their *interior state* that would otherwise be lost:

- **Commitments** — things they said they'd do ("I'll have that by Friday").
- **Positions / thinking** — stances, reads, and decisions they put into words.
- **Sentiment** — frustration, blockers, momentum.

Two consequences:

1. The existing import (which already keeps *only* messages where `senderId === me.id`)
   is exactly the right input — not a limitation.
2. **No thread/reply context is needed.** Sent-only is complete, which removes the
   biggest technical wrinkle.

## Goals

- Replace the brittle pasted-token auth with silent, self-refreshing auth.
- For a given day, mine the user's sent Teams messages into a **self-signal digest**
  organized as Commitments / Positions / Sentiment, each grounded in source messages.
- Surface contributions the user *did not* log — the diary's gaps — not just enrich
  existing entries.
- Learn relevance from the user's feedback (their own voice), as accumulating few-shot
  examples — without the user having to manage links.
- Feed the digest into existing diary structures (commitments → todos, positions →
  entries/context).

## Non-Goals (v1)

- Channel messages (import is intentionally chat-only and sent-only).
- Importing/displaying other participants' messages or reconstructing threads.
- Fully automatic, unattended (headless) auth — interactive login once is acceptable.
- Real-time/background sync — scanning stays an explicit, per-day action.
- A keychain-encrypted token cache (app-data-dir file for v1; keychain is a later hardening).

## Architecture

Three independent components:

```
┌─────────────────────┐   token    ┌──────────────────────┐   messages   ┌─────────────────────┐
│  ms-auth sidecar    │──────────▶│  teams.ts (frontend) │────────────▶│  signals service    │
│  (Bun/TS, compiled) │            │  scan + import        │              │  (claude_complete)  │
└─────────────────────┘            └──────────────────────┘              └─────────────────────┘
        │ MSAL cache (app data dir)          │ teams_chat_messages              │ teams_signal_items
        ▼                                     ▼                                  ▼
   silent refresh                       SQLite (existing)                  Contributions UI (digest + feedback)
```

### Component 1 — Auth Sidecar (`sidecar/ms-auth/`)

A small TypeScript program, built with Bun, that owns Microsoft auth. Lifted and typed
from the proven reference at `../mcp-ms-graph/auth-node.js`.

- **App registration:** public client `40b38db8-2da4-4f47-b276-6a46e655ab12`
  ("AMSAML - Agentic AI POC"), tenant `2c94bed6-d675-4d3d-a53b-7b461fd6acc2`.
  Already consented for `Chat.Read`, `User.Read.All`, `offline_access` for the user
  (via their Entra security group). *Note: this app is under active InfoSec review —
  consent could change; acceptable for a personal tool.*
- **Library:** `@azure/msal-node` `PublicClientApplication` with a cache plugin.
- **Flow:** auth-code + PKCE via a transient `localhost:3000` redirect (browser sign-in),
  with device-code fallback. `acquireTokenSilent()` for refresh.
- **Scopes:** Teams-chat-read only for v1 (`Chat.Read`, `User.Read.All`, `offline_access`).
- **Token cache:** written to a path passed in by the host (the Tauri **app-data dir**),
  *not* a file in the repo. (POC writes plaintext to the repo; we do not.)
- **Subcommands (JSON on stdout):**
  - `login` — runs interactive flow, persists cache, prints `{ account, status }`.
  - `token` — `acquireTokenSilent` → `{ accessToken, expiresOn }`; exits non-zero with
    `{ error: "interaction_required" }` when the refresh token has expired.
  - `status` — `{ connected, account | null }`.
- **Packaging:** `bun build --compile --target=bun-darwin-arm64` → single binary, named to
  the Tauri target triple (`ms-auth-aarch64-apple-darwin`), declared under
  `bundle.externalBin`. Add `@tauri-apps/plugin-shell` + capability to execute the sidecar.
- **Risk / first step:** validate that `@azure/msal-node` works under `bun build --compile`
  (it uses `node:crypto`/`node:http`). If `--compile` trips on dynamic requires, fall back to
  shipping the TS run via a bundled `bun` invocation — same design, different packaging.

### Component 2 — Token plumbing in `teams.ts`

- Replace `getTeamsChatAccessToken()` (reads pasted setting) with `getGraphToken()` that
  runs the sidecar `token` command via `Command.sidecar(...)`, parses JSON, and
  memo-caches the access token in memory until `expiresOn`.
- On `interaction_required`, surface a "Reconnect Microsoft" prompt (don't silently fail).
- `scanTeamsChats`, import, and `getTeamsChatMessagesForDate` are otherwise unchanged.
- **Remove** the pasted-token Settings field and the `TEAMS_CHAT_ACCESS_TOKEN` setting.

### Component 3 — Signal extraction service (`src/services/teamsSignals.ts`)

- Input: a day's imported sent messages (`getTeamsChatMessagesForDate(date)`), each with
  `bodyText`, `createdDateTime`, and `chatTopic`/`chatType` for light grouping context.
- Calls Claude via the **existing** `invoke("claude_complete", { model, ... })` path used by
  `services/summarization.ts` (model `claude-sonnet-4-20250514`). No new client.
- **Prompt:** a system prompt defining the three axes + a few-shot block. The model returns
  structured JSON: a list of signal items `{ axis, summary, sourceMessageIds[], confidence }`.
  Items may span multiple messages; messages may be classified as noise (omitted).
- **Few-shot strategy:**
  - Bootstrap with ~3–5 hand-authored seed examples (in the user's general voice) baked
    into the prompt — concrete `message → axis | noise + why` labels.
  - Augment with a recent sample of the user's *own labeled* signal items (accepted /
    dismissed / re-classified) so relevance learns the user's voice over time.
- Persist results to `teams_signal_items` (status `suggested`), deduped per date so re-runs
  don't duplicate.

## Data Model

Existing `teams_chat_messages` table and its `contribution_entry_id` FK are kept (a message
can still be associated to an entry when a signal is promoted).

New table `teams_signal_items`:

| column | type | notes |
|---|---|---|
| `id` | text PK | uuid |
| `signal_date` | text | `YYYY-MM-DD` |
| `axis` | text | `commitment` \| `position` \| `sentiment` |
| `summary` | text | synthesized one-liner / short paragraph |
| `source_message_ids` | text (json) | ids into `teams_chat_messages` for provenance |
| `status` | text | `suggested` \| `accepted` \| `dismissed` \| `promoted` |
| `feedback_label` | text null | user's re-classification, when corrected |
| `linked_entry_id` | text null | FK `contribution_entries.id` when promoted to/attached to an entry |
| `linked_todo_id` | text null | FK `contribution_todos.id` when promoted to a todo |
| `confidence` | real null | model confidence |
| `created_at` | integer (ts) | |

Indexes on `signal_date` and `status`. No separate "examples" table in v1 — the few-shot
set is assembled from labeled `teams_signal_items` rows.

## UX

On the Contributions page, the existing "Teams Sent Messages" panel becomes a **Teams
Signals** panel for the selected date:

- A single action: **"Pull Teams context"** — gets a token, scans/imports the day's sent
  messages, then runs extraction. (Auto-runs once after a successful scan.)
- Three grouped sections: **Commitments**, **Positions**, **Sentiment**. Each item shows
  its synthesized summary, an expandable list of its source messages (with "Open in Teams"
  links), and a "logged / not logged yet" tag.
- Low-friction feedback per item: **dismiss** ("not relevant"), **re-classify** (move to a
  different axis). Dismiss/re-classify update `status`/`feedback_label` and feed future
  few-shot.
- Low-friction diary actions: **commitment → new todo** (`contribution_todos`),
  **position → new entry** or **attach to existing entry** (`contribution_entries` +
  `linked_entry_id`). Promotion sets status `promoted`.
- The Settings section changes from a token-paste textarea to a **"Connect Microsoft"**
  button + connected-account/status display + scan-window selector.

## Reconciliation with in-flight code

| Existing (uncommitted) | Disposition |
|---|---|
| `teams_chat_messages` table + FK | **Keep** |
| `scanTeamsChats` / import / `getTeamsChatMessagesForDate` | **Keep** |
| `getTeamsChatAccessToken` / pasted token / `TEAMS_CHAT_ACCESS_TOKEN` setting | **Remove**, replace with sidecar `getGraphToken()` |
| Settings token-paste textarea | **Replace** with "Connect Microsoft" button + status |
| `linkTeamsMessageToContribution` + "Link to Entry" (links to `entries[0]`) | **Replace** with signal-driven promote/attach actions |
| "Teams Sent Messages" panel | **Evolve** into "Teams Signals" digest panel |
| CSP allowing `graph.microsoft.com` | **Keep** (frontend still fetches Graph directly) |

## Risks & Open Questions

- **MSAL under `bun build --compile`** — validate first (see Component 1). Fallback exists.
- **App registration governance** — `40b38db8` is an InfoSec-reviewed POC; Teams scopes are
  fine today but could be revoked. Acceptable for a personal tool; revisit if shared.
- **Summary thinness** — sent-only text is sometimes terse. Decision: ship sent-only; only
  consider fetching reply-context if summaries prove too thin in practice.
- **Token cache at rest** — app-data-dir file for v1; OS-keychain encryption is a later
  hardening step.
- **Cost** — extraction is one Claude call per "Pull Teams context" per day; acceptable.

## Future (v2+, explicitly deferred)

- Time/content-based auto-suggested pairing to specific entries.
- Cross-day rollups (e.g. weekly commitment tracking, "open commitments" view).
- Keychain-backed token storage; multi-user packaging.
- Re-evaluate the three axes after real results (per user: "we'll update after we have some
  results to look at if necessary").
