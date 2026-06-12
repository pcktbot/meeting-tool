# Teams Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle hand-pasted Microsoft Graph token with a Bun/TS auth sidecar that signs in once and silently refreshes, so scanning Teams chats "just works."

**Architecture:** A standalone TypeScript program (built to a single binary with Bun) owns Microsoft auth via `@azure/msal-node` (public client `40b38db8…`, PKCE auth-code over `localhost:3000`, device-code fallback). It exposes `login` / `token` / `status` subcommands that print JSON. The Tauri app ships it as a sidecar and calls it from three Rust commands (`ms_auth_login`/`ms_auth_token`/`ms_auth_status`) that pass the app-data-dir cache path. The frontend `teams.ts` swaps its token source from a stored setting to `invoke("ms_auth_token")`; Settings swaps the paste field for a "Connect Microsoft" button.

**Tech Stack:** Bun, TypeScript, `@azure/msal-node`, `open`; Tauri v2 + `tauri-plugin-shell` (Rust); React/TS frontend.

**This is Plan 1 of 2.** Plan 2 (signal extraction + digest UI + feedback) is written after this lands and we can run it against real imported messages.

---

## File Structure

**New — auth sidecar (`sidecar/ms-auth/`):**
- `package.json` — deps + scripts (Bun project, ESM).
- `tsconfig.json` — editor/type hints.
- `src/scopes.ts` — `buildScopes()`: the exact Graph scopes for Teams chat read.
- `src/args.ts` — `parseArgs()`: argv → `{ command, cachePath, deviceCode }`.
- `src/auth.ts` — MSAL config, cache plugin (path-injected), `getToken` / `login` / `status`.
- `src/index.ts` — CLI dispatch; prints JSON to **stdout**, all logs to **stderr**.
- `test/scopes.test.ts`, `test/args.test.ts` — `bun test` unit tests for the pure helpers.
- `build.sh` — `bun build --compile` → `src-tauri/binaries/ms-auth-<target-triple>`.

**New — Rust command:**
- `src-tauri/src/commands/ms_auth.rs` — runs the sidecar via `app.shell().sidecar(...)`, supplies the app-data cache path, returns stdout.

**Modified:**
- `src-tauri/Cargo.toml` — add `tauri-plugin-shell`.
- `src-tauri/tauri.conf.json` — add `bundle.externalBin`.
- `src-tauri/src/lib.rs` — register shell plugin + the three commands.
- `src-tauri/src/commands/mod.rs` — `pub mod ms_auth;`.
- `src/services/teams.ts` — replace token source with `getGraphToken()`.
- `src/services/settings.ts` — remove `TEAMS_CHAT_ACCESS_TOKEN`.
- `src/components/Settings/SettingsModal.tsx` — replace paste field with Connect button + status.

---

## Task 1: Scaffold the sidecar Bun project

**Files:**
- Create: `sidecar/ms-auth/package.json`
- Create: `sidecar/ms-auth/tsconfig.json`

- [ ] **Step 1: Create `sidecar/ms-auth/package.json`**

```json
{
  "name": "ms-auth-sidecar",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "build": "bash ./build.sh"
  },
  "dependencies": {
    "@azure/msal-node": "^2.15.0",
    "open": "^11.0.0"
  }
}
```

- [ ] **Step 2: Create `sidecar/ms-auth/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd sidecar/ms-auth && bun install`
Expected: creates `node_modules` + `bun.lock`; exits 0; no errors.

- [ ] **Step 4: Commit**

```bash
git add sidecar/ms-auth/package.json sidecar/ms-auth/tsconfig.json sidecar/ms-auth/bun.lock
git commit -m "chore: scaffold ms-auth sidecar project"
```

---

## Task 2: `buildScopes()` (TDD)

**Files:**
- Create: `sidecar/ms-auth/src/scopes.ts`
- Test: `sidecar/ms-auth/test/scopes.test.ts`

- [ ] **Step 1: Write the failing test**

`sidecar/ms-auth/test/scopes.test.ts`:

```ts
import { test, expect } from "bun:test";
import { buildScopes } from "../src/scopes";

test("buildScopes returns Teams chat read graph scopes plus offline_access", () => {
  expect(buildScopes()).toEqual([
    "https://graph.microsoft.com/Chat.Read",
    "https://graph.microsoft.com/User.Read.All",
    "offline_access",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar/ms-auth && bun test test/scopes.test.ts`
Expected: FAIL — cannot resolve `../src/scopes`.

- [ ] **Step 3: Write minimal implementation**

`sidecar/ms-auth/src/scopes.ts`:

```ts
// Teams chat read = Chat.Read + User.Read.All (per the reference app registration),
// prefixed with the Graph resource, plus offline_access to mint refresh tokens.
const GRAPH = "https://graph.microsoft.com";
const TEAMS_CHAT_READ = ["Chat.Read", "User.Read.All"];

export function buildScopes(): string[] {
  return [...TEAMS_CHAT_READ.map((s) => `${GRAPH}/${s}`), "offline_access"];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar/ms-auth && bun test test/scopes.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add sidecar/ms-auth/src/scopes.ts sidecar/ms-auth/test/scopes.test.ts
git commit -m "feat: ms-auth scope builder for Teams chat read"
```

---

## Task 3: `parseArgs()` (TDD)

**Files:**
- Create: `sidecar/ms-auth/src/args.ts`
- Test: `sidecar/ms-auth/test/args.test.ts`

- [ ] **Step 1: Write the failing test**

`sidecar/ms-auth/test/args.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseArgs } from "../src/args";

test("parseArgs reads command and cache path", () => {
  expect(parseArgs(["token", "--cache", "/tmp/c.json"])).toEqual({
    command: "token",
    cachePath: "/tmp/c.json",
    deviceCode: false,
  });
});

test("parseArgs reads the device-code flag", () => {
  expect(parseArgs(["login", "--device-code", "--cache", "/x"])).toEqual({
    command: "login",
    cachePath: "/x",
    deviceCode: true,
  });
});

test("parseArgs accepts status without a cache path", () => {
  expect(parseArgs(["status"])).toEqual({
    command: "status",
    cachePath: undefined,
    deviceCode: false,
  });
});

test("parseArgs throws on an unknown command", () => {
  expect(() => parseArgs(["bogus"])).toThrow("Unknown command: bogus");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar/ms-auth && bun test test/args.test.ts`
Expected: FAIL — cannot resolve `../src/args`.

- [ ] **Step 3: Write minimal implementation**

`sidecar/ms-auth/src/args.ts`:

```ts
export type Command = "login" | "token" | "status";

export interface ParsedArgs {
  command: Command;
  cachePath: string | undefined;
  deviceCode: boolean;
}

const COMMANDS: Command[] = ["login", "token", "status"];

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command;
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  let cachePath: string | undefined;
  let deviceCode = false;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--cache") {
      cachePath = argv[i + 1];
      i++;
    } else if (argv[i] === "--device-code") {
      deviceCode = true;
    }
  }

  return { command, cachePath, deviceCode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar/ms-auth && bun test test/args.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

```bash
git add sidecar/ms-auth/src/args.ts sidecar/ms-auth/test/args.test.ts
git commit -m "feat: ms-auth CLI argument parser"
```

---

## Task 4: MSAL auth module

This wraps `@azure/msal-node`. The flows require a real browser + Microsoft sign-in, so they are verified manually in Task 6 (after the CLI exists). This task only has to compile/typecheck cleanly.

**Files:**
- Create: `sidecar/ms-auth/src/auth.ts`

- [ ] **Step 1: Write the auth module**

`sidecar/ms-auth/src/auth.ts`:

```ts
import {
  PublicClientApplication,
  CryptoProvider,
  InteractionRequiredAuthError,
  type Configuration,
  type ICachePlugin,
} from "@azure/msal-node";
import * as fs from "fs";
import http from "http";
import open from "open";
import { buildScopes } from "./scopes";

// Public client app registration "AMSAML - Agentic AI POC" (delegated).
const CLIENT_ID = "40b38db8-2da4-4f47-b276-6a46e655ab12";
const TENANT_ID = "2c94bed6-d675-4d3d-a53b-7b461fd6acc2";
const REDIRECT_URI = "http://localhost:3000";

export interface TokenResult {
  accessToken: string;
  expiresOn: string | null;
  account: string | null;
}

export interface StatusResult {
  connected: boolean;
  account: string | null;
}

export interface AuthErrorResult {
  error: "interaction_required";
  reason?: string;
}

// Cache is persisted to a host-provided path (the Tauri app-data dir), NOT a
// file inside the repo. All logging goes to stderr so stdout stays clean JSON.
function makeCachePlugin(cachePath: string): ICachePlugin {
  return {
    beforeCacheAccess: async (ctx) => {
      if (fs.existsSync(cachePath)) {
        ctx.tokenCache.deserialize(fs.readFileSync(cachePath, "utf-8"));
      }
    },
    afterCacheAccess: async (ctx) => {
      if (ctx.cacheHasChanged) {
        fs.writeFileSync(cachePath, ctx.tokenCache.serialize());
      }
    },
  };
}

export function createPca(cachePath: string): PublicClientApplication {
  const config: Configuration = {
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
    cache: { cachePlugin: makeCachePlugin(cachePath) },
  };
  return new PublicClientApplication(config);
}

export async function status(pca: PublicClientApplication): Promise<StatusResult> {
  const accounts = await pca.getTokenCache().getAllAccounts();
  return {
    connected: accounts.length > 0,
    account: accounts[0]?.username ?? null,
  };
}

export async function getToken(
  pca: PublicClientApplication,
): Promise<TokenResult | AuthErrorResult> {
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    return { error: "interaction_required", reason: "no_account" };
  }
  try {
    const res = await pca.acquireTokenSilent({
      account: accounts[0],
      scopes: buildScopes(),
      forceRefresh: false,
    });
    return {
      accessToken: res.accessToken,
      expiresOn: res.expiresOn ? res.expiresOn.toISOString() : null,
      account: res.account?.username ?? null,
    };
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      return { error: "interaction_required" };
    }
    throw err;
  }
}

async function loginDeviceCode(pca: PublicClientApplication): Promise<TokenResult> {
  const res = await pca.acquireTokenByDeviceCode({
    scopes: buildScopes(),
    deviceCodeCallback: (response) => {
      // User-facing instructions must go to stderr, not stdout.
      process.stderr.write(`\n${response.message}\n\n`);
    },
  });
  return {
    accessToken: res!.accessToken,
    expiresOn: res!.expiresOn ? res!.expiresOn.toISOString() : null,
    account: res!.account?.username ?? null,
  };
}

async function loginAuthCode(pca: PublicClientApplication): Promise<TokenResult> {
  // PKCE is required by this app registration.
  const { verifier, challenge } = await new CryptoProvider().generatePkceCodes();

  let server: http.Server;
  const codePromise = new Promise<string>((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Sign-in failed</h1><p>You can close this window.</p></body></html>");
        reject(new Error(`${error}: ${url.searchParams.get("error_description") ?? ""}`));
      } else if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Signed in</h1><p>You can close this window and return to the app.</p></body></html>");
        resolve(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Invalid request</h1></body></html>");
      }
    });
    server.listen(3000, () => process.stderr.write("Waiting for sign-in on http://localhost:3000\n"));
  });

  const authUrl = await pca.getAuthCodeUrl({
    scopes: buildScopes(),
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  await open(authUrl);

  const code = await codePromise;
  server!.close();

  const res = await pca.acquireTokenByCode({
    code,
    scopes: buildScopes(),
    redirectUri: REDIRECT_URI,
    codeVerifier: verifier,
  });
  return {
    accessToken: res.accessToken,
    expiresOn: res.expiresOn ? res.expiresOn.toISOString() : null,
    account: res.account?.username ?? null,
  };
}

export async function login(
  pca: PublicClientApplication,
  deviceCode: boolean,
): Promise<TokenResult> {
  // Try silent first so an already-connected account doesn't re-prompt.
  const existing = await getToken(pca);
  if (!("error" in existing)) {
    return existing;
  }
  return deviceCode ? loginDeviceCode(pca) : loginAuthCode(pca);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd sidecar/ms-auth && bunx tsc --noEmit`
Expected: exits 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add sidecar/ms-auth/src/auth.ts
git commit -m "feat: ms-auth MSAL module (login/token/status, injected cache path)"
```

---

## Task 5: CLI entry point

**Files:**
- Create: `sidecar/ms-auth/src/index.ts`

- [ ] **Step 1: Write the entry point**

`sidecar/ms-auth/src/index.ts`:

```ts
import { parseArgs } from "./args";
import { createPca, getToken, login, status } from "./auth";

function emit(result: unknown, exitCode = 0): void {
  // Exactly one JSON object on stdout; callers parse this.
  process.stdout.write(JSON.stringify(result));
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    emit({ error: "bad_args", message: (err as Error).message }, 1);
    return;
  }

  if (parsed.command !== "status" && !parsed.cachePath) {
    emit({ error: "bad_args", message: "--cache <path> is required" }, 1);
    return;
  }

  // status with no cache path = trivially not connected.
  if (parsed.command === "status" && !parsed.cachePath) {
    emit({ connected: false, account: null });
    return;
  }

  const pca = createPca(parsed.cachePath!);

  try {
    if (parsed.command === "status") {
      emit(await status(pca));
    } else if (parsed.command === "token") {
      const result = await getToken(pca);
      emit(result, "error" in result ? 2 : 0);
    } else {
      emit(await login(pca, parsed.deviceCode));
    }
  } catch (err) {
    emit({ error: "auth_failed", message: (err as Error).message }, 1);
  }
}

void main();
```

- [ ] **Step 2: Typecheck**

Run: `cd sidecar/ms-auth && bunx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Smoke-test `status` with a non-existent cache (no login needed)**

Run: `cd sidecar/ms-auth && bun run src/index.ts status --cache /tmp/does-not-exist.json`
Expected stdout (exact): `{"connected":false,"account":null}`; exit 0.

- [ ] **Step 4: Commit**

```bash
git add sidecar/ms-auth/src/index.ts
git commit -m "feat: ms-auth CLI entry (json stdout, status/token/login dispatch)"
```

---

## Task 6: Compile to a sidecar binary + validate the MSAL-under-Bun risk

This is the spec's flagged risk: confirm `@azure/msal-node` works inside a `bun build --compile` binary and that a real login round-trips.

**Files:**
- Create: `sidecar/ms-auth/build.sh`
- Create: `src-tauri/binaries/` (build output dir; binary itself is git-ignored — see Step 4)

- [ ] **Step 1: Write the build script**

`sidecar/ms-auth/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Tauri resolves sidecars as binaries/ms-auth-<target-triple>. Derive the triple
# from the Rust host so it matches what `tauri build` expects.
TRIPLE="$(rustc -Vv | sed -n 's/^host: //p')"
OUT_DIR="../../src-tauri/binaries"
OUT="${OUT_DIR}/ms-auth-${TRIPLE}"

mkdir -p "$OUT_DIR"
bun build ./src/index.ts --compile --outfile "$OUT"
echo "Built $OUT"
```

- [ ] **Step 2: Build the binary**

Run: `cd sidecar/ms-auth && chmod +x build.sh && bun run build`
Expected: prints `Built ../../src-tauri/binaries/ms-auth-<triple>` (e.g. `…-aarch64-apple-darwin`); the file exists and is executable.

- [ ] **Step 3: Verify the compiled binary runs (`status`, no login)**

Run (from `sidecar/ms-auth`): `../../src-tauri/binaries/ms-auth-$(rustc -Vv | sed -n 's/^host: //p') status --cache /tmp/nope.json`
Expected stdout (exact): `{"connected":false,"account":null}`; exit 0.
**If this crashes** (dynamic-require/MSAL error), the spec's fallback applies: ship `bun src/index.ts` instead of `--compile`. Stop and report before proceeding.

- [ ] **Step 4: Validate a real login round-trip (interactive — operator runs this)**

Run: `BIN=../../src-tauri/binaries/ms-auth-$(rustc -Vv | sed -n 's/^host: //p'); "$BIN" login --cache /tmp/ms-auth-test.json`
Expected: a browser opens to Microsoft sign-in; after signing in, the page says "Signed in"; stdout is a single JSON object like `{"accessToken":"eyJ…","expiresOn":"2026-…","account":"david.miller@realpage.com"}`; exit 0.
Then run: `"$BIN" token --cache /tmp/ms-auth-test.json`
Expected: JSON with a fresh `accessToken` (silent, no browser); exit 0. Then delete the test cache: `rm /tmp/ms-auth-test.json`.

- [ ] **Step 5: Git-ignore the compiled binary**

Append to `src-tauri/.gitignore` (create the file if absent):

```
/binaries/
```

- [ ] **Step 6: Commit**

```bash
git add sidecar/ms-auth/build.sh src-tauri/.gitignore
git commit -m "build: compile ms-auth sidecar to target-triple binary"
```

---

## Task 7: Add the shell plugin + declare the sidecar

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs:13` (the `.plugin(...)` chain)

- [ ] **Step 1: Add the Rust dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, after the `tauri-plugin-dialog = "2"` line, add:

```toml
tauri-plugin-shell = "2"
```

- [ ] **Step 2: Declare the sidecar in `tauri.conf.json`**

In `src-tauri/tauri.conf.json`, change the `"bundle"` object's opening so it includes `externalBin` (add the one line after `"active": true,`):

```json
  "bundle": {
    "active": true,
    "externalBin": ["binaries/ms-auth"],
    "targets": "all",
```

- [ ] **Step 3: Register the plugin**

In `src-tauri/src/lib.rs`, add to the builder chain right after `.plugin(tauri_plugin_dialog::init())`:

```rust
        .plugin(tauri_plugin_shell::init())
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo build`
Expected: compiles successfully (downloads `tauri-plugin-shell`); exit 0.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/lib.rs
git commit -m "feat: add tauri-plugin-shell and declare ms-auth sidecar"
```

---

## Task 8: Rust commands that drive the sidecar

**Files:**
- Create: `src-tauri/src/commands/ms_auth.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (invoke_handler list)

- [ ] **Step 1: Write the command module**

`src-tauri/src/commands/ms_auth.rs`:

```rust
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

// The MSAL token cache lives in the app-data dir, not the repo.
fn cache_path(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ms-auth-cache.json").to_string_lossy().to_string())
}

async fn run_sidecar(app: &AppHandle, mut args: Vec<String>) -> Result<String, String> {
    args.push("--cache".into());
    args.push(cache_path(app)?);

    let output = app
        .shell()
        .sidecar("ms-auth")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // The sidecar prints a JSON body even on a non-zero exit (e.g.
    // interaction_required). Return it so the frontend can branch on `.error`.
    if !stdout.is_empty() {
        Ok(stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub async fn ms_auth_token(app: AppHandle) -> Result<String, String> {
    run_sidecar(&app, vec!["token".into()]).await
}

#[tauri::command]
pub async fn ms_auth_login(app: AppHandle, device_code: bool) -> Result<String, String> {
    let mut args = vec!["login".into()];
    if device_code {
        args.push("--device-code".into());
    }
    run_sidecar(&app, args).await
}

#[tauri::command]
pub async fn ms_auth_status(app: AppHandle) -> Result<String, String> {
    run_sidecar(&app, vec!["status".into()]).await
}
```

- [ ] **Step 2: Declare the module**

In `src-tauri/src/commands/mod.rs`, add (keep alphabetical-ish, after `pub mod model;`):

```rust
pub mod ms_auth;
```

- [ ] **Step 3: Register the commands**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![ … ]`, add these three lines (e.g. after the `commands::model::*` entries):

```rust
            commands::ms_auth::ms_auth_login,
            commands::ms_auth::ms_auth_token,
            commands::ms_auth::ms_auth_status,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo build`
Expected: compiles successfully; exit 0.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ms_auth.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: ms_auth Rust commands driving the sidecar"
```

> **Troubleshooting note for the operator:** Sidecars invoked from Rust via `app.shell().sidecar(...)` are not gated by the webview ACL, so no `capabilities/default.json` change is expected. If a runtime "not allowed" / scope error appears, add a `shell:allow-execute` sidecar scope for `ms-auth` to `src-tauri/capabilities/default.json` and re-run.

---

## Task 9: Swap the token source in `teams.ts`

The current code reads a stored token (`getTeamsChatAccessToken`). Replace it with `getGraphToken()`, which calls the sidecar via `invoke` and memo-caches until expiry.

**Files:**
- Modify: `src/services/teams.ts:116-122` (token getters) and `:173-181` (`scanTeamsChats` start)

- [ ] **Step 1: Add the invoke import**

At the top of `src/services/teams.ts`, after the existing imports, add:

```ts
import { invoke } from "@tauri-apps/api/core";
```

- [ ] **Step 2: Replace the token getter/setter with sidecar-backed `getGraphToken`**

In `src/services/teams.ts`, delete these two functions:

```ts
export async function getTeamsChatAccessToken(): Promise<string | null> {
  return getSetting(SETTINGS.TEAMS_CHAT_ACCESS_TOKEN);
}

export async function setTeamsChatAccessToken(token: string): Promise<void> {
  await setSetting(SETTINGS.TEAMS_CHAT_ACCESS_TOKEN, token.trim());
}
```

and replace them with:

```ts
interface SidecarTokenOk {
  accessToken: string;
  expiresOn: string | null;
  account: string | null;
}
interface SidecarError {
  error: string;
  message?: string;
  reason?: string;
}

export class TeamsAuthRequiredError extends Error {
  constructor() {
    super("Connect Microsoft in Settings to scan Teams chats.");
    this.name = "TeamsAuthRequiredError";
  }
}

let cachedToken: { value: string; expiresAtMs: number } | null = null;

export async function getGraphToken(): Promise<string> {
  // 60s safety margin so we never hand back an about-to-expire token.
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > Date.now()) {
    return cachedToken.value;
  }

  const raw = await invoke<string>("ms_auth_token");
  const parsed = JSON.parse(raw) as SidecarTokenOk | SidecarError;

  if ("error" in parsed) {
    if (parsed.error === "interaction_required") throw new TeamsAuthRequiredError();
    throw new Error(parsed.message ?? `Teams auth failed: ${parsed.error}`);
  }

  cachedToken = {
    value: parsed.accessToken,
    expiresAtMs: parsed.expiresOn ? Date.parse(parsed.expiresOn) : Date.now() + 5 * 60_000,
  };
  return cachedToken.value;
}
```

- [ ] **Step 3: Use `getGraphToken` in `scanTeamsChats`**

In `src/services/teams.ts`, replace the opening of `scanTeamsChats` (the `getTeamsChatAccessToken()` block):

```ts
  const accessToken = await getTeamsChatAccessToken();
  if (!accessToken) {
    throw new Error("Add a Microsoft Graph access token in Settings before scanning Teams chats.");
  }
```

with:

```ts
  const accessToken = await getGraphToken();
```

- [ ] **Step 4: Drop the now-unused `setSetting` import if unused**

Check the imports line `import { getSetting, setSetting, SETTINGS } from "./settings";`. `setSetting` is still used by `setTeamsChatLastScanAt`-style writes (`SETTINGS.TEAMS_CHAT_LAST_SCAN_AT`) inside `scanTeamsChats`, so leave it. (No change unless tsc flags it in Step 5.)

- [ ] **Step 5: Typecheck the frontend**

Run: `bun run build`
Expected: `tsc` passes and Vite builds; exit 0. (If tsc flags an unused `setSetting`/`getSetting`, remove only the unused name from that import.)

- [ ] **Step 6: Commit**

```bash
git add src/services/teams.ts
git commit -m "feat: source Graph token from ms-auth sidecar instead of pasted token"
```

---

## Task 10: Settings UI — "Connect Microsoft" instead of paste

Replace the token textarea with a Connect button (runs `ms_auth_login`) + connected-account status (runs `ms_auth_status`). Keep the scan-window selector and last-scan display.

**Files:**
- Modify: `src/components/Settings/SettingsModal.tsx`
- Modify: `src/services/settings.ts:23` (remove `TEAMS_CHAT_ACCESS_TOKEN`)

- [ ] **Step 1: Remove the dead setting key**

In `src/services/settings.ts`, delete this line from the `SETTINGS` object:

```ts
  TEAMS_CHAT_ACCESS_TOKEN: "teams_chat_access_token",
```

- [ ] **Step 2: Update SettingsModal imports**

In `src/components/Settings/SettingsModal.tsx`, change the teams import block to drop the token getter/setter and keep the scan-day + last-scan helpers, and add `invoke`:

```ts
import { invoke } from "@tauri-apps/api/core";
import {
  getTeamsChatLastScanAt,
  getTeamsChatScanDays,
  setTeamsChatScanDays,
} from "../../services/teams";
```

- [ ] **Step 3: Replace token state with connection state**

In `SettingsForm`, delete the `teamsTokenInput` state line:

```ts
  const [teamsTokenInput, setTeamsTokenInput] = useState("");
```

and add:

```ts
  const [teamsAccount, setTeamsAccount] = useState<string | null>(null);
  const [teamsConnecting, setTeamsConnecting] = useState(false);
```

- [ ] **Step 4: Load status instead of the token in the effect**

Replace the teams-loading `useEffect` body so it no longer reads a token and instead reads scan settings + connection status:

```ts
  useEffect(() => {
    Promise.all([getTeamsChatScanDays(), getTeamsChatLastScanAt()])
      .then(([scanDays, lastScan]) => {
        setTeamsScanDaysInput(scanDays);
        setTeamsLastScanAt(lastScan);
      })
      .catch((err) => {
        console.error("Failed to load Teams settings:", err);
        setTeamsStatus("Could not load Teams settings.");
      });

    invoke<string>("ms_auth_status")
      .then((raw) => {
        const parsed = JSON.parse(raw) as { connected: boolean; account: string | null };
        setTeamsAccount(parsed.connected ? parsed.account : null);
      })
      .catch((err) => console.error("Failed to read Teams connection status:", err));
  }, []);
```

- [ ] **Step 5: Add the connect handler and adjust save**

Replace `handleSaveTeams` so it only saves scan days (no token), and add `handleConnectTeams`:

```ts
  const handleSaveTeams = async () => {
    await setTeamsChatScanDays(teamsScanDaysInput);
    setTeamsStatus("Teams settings saved.");
    setTimeout(() => setTeamsStatus(null), 2500);
  };

  const handleConnectTeams = async () => {
    setTeamsConnecting(true);
    setTeamsStatus(null);
    try {
      const raw = await invoke<string>("ms_auth_login", { deviceCode: false });
      const parsed = JSON.parse(raw) as
        | { account: string | null }
        | { error: string; message?: string };
      if ("error" in parsed) {
        setTeamsStatus(parsed.message ?? `Sign-in failed: ${parsed.error}`);
      } else {
        setTeamsAccount(parsed.account);
        setTeamsStatus("Microsoft account connected.");
      }
    } catch (err) {
      console.error("Teams connect failed:", err);
      setTeamsStatus(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setTeamsConnecting(false);
    }
  };
```

- [ ] **Step 6: Replace the token textarea field in JSX**

In the `Teams Chat Import` section, replace the entire `settings-field` block containing the `teams-access-token` textarea (and its hint paragraph) with:

```tsx
            <div className="settings-field">
              <span className="settings-label">Microsoft Account</span>
              <p className="settings-static-text">
                {teamsAccount ? `Connected as ${teamsAccount}` : "Not connected."}
              </p>
              <button
                className="settings-save-btn"
                onClick={handleConnectTeams}
                disabled={teamsConnecting}
                type="button"
              >
                {teamsConnecting ? "Opening sign-in..." : teamsAccount ? "Reconnect" : "Connect Microsoft"}
              </button>
              <p className="settings-hint">
                Opens a browser to sign in once. The token then refreshes silently;
                imports are limited to chat messages you sent.
              </p>
            </div>
```

- [ ] **Step 7: Typecheck/build**

Run: `bun run build`
Expected: `tsc` passes and Vite builds; exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/Settings/SettingsModal.tsx src/services/settings.ts
git commit -m "feat: Settings 'Connect Microsoft' flow replacing pasted token"
```

---

## Task 11: End-to-end manual verification

No automated harness covers the full Tauri flow, so verify by running the app.

- [ ] **Step 1: Ensure the sidecar binary exists**

Run: `cd sidecar/ms-auth && bun run build`
Expected: `Built …/binaries/ms-auth-<triple>`.

- [ ] **Step 2: Launch the app**

Run: `bun run tauri dev`
Expected: the "Daily Work Diary" window opens with no console errors about missing commands.

- [ ] **Step 3: Connect**

In Settings → Teams Chat Import, click **Connect Microsoft**. Expected: a browser opens to Microsoft sign-in; after signing in, the field shows "Connected as david.miller@realpage.com" and the status reads "Microsoft account connected."

- [ ] **Step 4: Scan**

On the Contributions page for today, click **Scan Chats**. Expected: the scan completes and reports imported message counts (no "add a Graph token" error). Imported sent messages appear in the "Teams Sent Messages" panel.

- [ ] **Step 5: Confirm silent refresh**

Quit and relaunch the app, then click **Scan Chats** again without reconnecting. Expected: it works with no browser prompt (token refreshed silently via the sidecar).

- [ ] **Step 6: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "test: verify ms-auth end-to-end (connect, scan, silent refresh)"
```

---

## Self-Review

**Spec coverage (against `2026-06-12-teams-contribution-signals-design.md`):**
- Auth sidecar (Component 1): Tasks 1–6 — package, scopes, args, MSAL module (login/token/status, PKCE, injected cache path), CLI JSON output, compiled binary + risk validation. ✓
- Token plumbing in `teams.ts` (Component 2): Task 9 — `getGraphToken()` via `invoke`, memo-cache, `interaction_required` surfaced as `TeamsAuthRequiredError`. ✓
- Remove pasted-token path: Task 9 (deletes getters) + Task 10 (Settings UI + removes `TEAMS_CHAT_ACCESS_TOKEN`). ✓
- Cache in app-data dir, not repo: Task 8 `cache_path` + `.gitignore` for binaries (Task 6). ✓
- Tauri wiring (shell plugin, externalBin, commands): Tasks 7–8. ✓
- Component 3 (signal extraction/UI/feedback): intentionally **deferred to Plan 2** — out of scope here, stated in the header.

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have exact expected output. The two interactive steps (Task 6 Step 4, Task 11) are explicitly operator-run with described expected results, not fake automated assertions.

**Type consistency:** `getGraphToken` (Task 9) matches the sidecar's `token` JSON shape (`accessToken`/`expiresOn`/`account`) from `auth.ts` (Task 4) and `index.ts` emit (Task 5). `ms_auth_login` takes `device_code` (Rust, Task 8) ↔ invoked as `{ deviceCode: false }` (Task 10) — Tauri auto-converts snake_case/camelCase args. Command names `ms_auth_login/token/status` are identical across Tasks 8, 9, 10.

---

## Known Deferrals (Plan 2 / later)

- Signal extraction service, `teams_signal_items` table, digest UI, feedback loop.
- OS-keychain encryption of the token cache (currently an app-data-dir file).
- Cross-platform sidecar builds (this plan builds for the current host triple only).
