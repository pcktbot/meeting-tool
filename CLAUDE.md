# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Desktop meeting-transcription app (Tauri v2 + Rust backend, React 19 + Vite frontend). Local transcription via `whisper-rs`; summaries via the Claude API. Runtime/package manager is **Bun** everywhere, not npm/yarn/pnpm. Note: the app is branded "Daily Work Diary" in `tauri.conf.json` (productName/window title), diverging from the README title and the `meeting-tool` package/crate name — this is a known inconsistency, not a bug.

Three semi-independent Bun projects share this one repo, each with its own `package.json`/lockfile:
- Root — Tauri app (`src/` frontend, `src-tauri/` Rust backend)
- `mcp-server/` — standalone MCP server exposing meeting-tool tools (contributions, summaries, cleanup, highlights) against the same DB
- `sidecar/ms-auth/` — Bun/TS CLI compiled to a native binary, bundled as a Tauri sidecar for Microsoft Graph auth

## Commands

- `bun tauri dev` — run the full app (Vite + Tauri); `bun run dev` starts Vite alone, no Tauri shell
- `bun tauri build` — production build
- `bun run tsc --noEmit` — type check (root `build` script also runs `tsc`)
- `bun run db:new-migration <name>` — scaffold a new numbered SQL migration (not drizzle-kit directly)
- `mcp-server`: `bun run start` (`src/index.ts`), `bun run typecheck`
- `sidecar/ms-auth`: `bun test`, `bash ./build.sh` to build (see below — don't `bun build` it directly)

No lint config or command exists anywhere in the repo. No CI. Tests only exist in `sidecar/ms-auth`.

## Architecture notes

- **Two separate DB layers, not one**: frontend uses PGlite (in-browser Postgres over IndexedDB) + Drizzle ORM (`src/db/`); the Rust side uses bundled `rusqlite` (`src-tauri/src/database.rs`). Know which one owns the data you're touching — they are not the same store.
- **ms-auth sidecar**: `sidecar/ms-auth/build.sh` derives the Rust host's target triple via `rustc -Vv` and compiles with `bun build --compile` to `src-tauri/binaries/ms-auth-<triple>`, matching Tauri's sidecar naming convention (`bundle.externalBin` in `tauri.conf.json`). Rust invokes it via `app.shell().sidecar("ms-auth")` (`src-tauri/src/commands/ms_auth.rs`), exposing `ms_auth_login`/`ms_auth_token`/`ms_auth_status`. The sidecar always prints a single JSON object to stdout, even on non-zero exit (e.g. `interaction_required`) — Rust reads that JSON rather than treating a bad exit code as failure. Auth cache lives at `<app-data-dir>/ms-auth-cache.json`, not in the repo.
- **CSP**: `tauri.conf.json`'s `connect-src` is an explicit allowlist (`api.anthropic.com`, `huggingface.co`, `graph.microsoft.com`). Any new external endpoint needs an entry here or requests will be blocked at runtime.
- **Tauri capabilities**: `src-tauri/capabilities/default.json` only grants recursive appdata fs read/write and dialog open/confirm. New Tauri commands touching other resources or plugins need an ACL/capability update (see `src-tauri/gen/schemas` for the regenerated schemas).
- Design/planning docs for larger features live under `docs/superpowers/{plans,specs}/` and follow the `superpowers` skill's plan format (`- [ ]` checkboxes for `executing-plans`/`subagent-driven-development`). Follow that same plan-first pattern for non-trivial features.
