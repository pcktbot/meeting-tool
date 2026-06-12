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
  if (res === null) {
    throw new Error("Device code flow returned no token");
  }
  return {
    accessToken: res.accessToken,
    expiresOn: res.expiresOn ? res.expiresOn.toISOString() : null,
    account: res.account?.username ?? null,
  };
}

async function loginAuthCode(pca: PublicClientApplication): Promise<TokenResult> {
  // PKCE is required by this app registration.
  const { verifier, challenge } = await new CryptoProvider().generatePkceCodes();

  const server = http.createServer();
  const codePromise = new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
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
        reject(new Error("Redirect contained neither an auth code nor an error"));
      }
    });
    server.listen(3000, () => process.stderr.write("Waiting for sign-in on http://localhost:3000\n"));
  });

  try {
    const authUrl = await pca.getAuthCodeUrl({
      scopes: buildScopes(),
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    });
    await open(authUrl);

    const code = await codePromise;

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
  } finally {
    server.close();
  }
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
