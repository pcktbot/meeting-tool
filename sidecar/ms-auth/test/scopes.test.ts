import { test, expect } from "bun:test";
import { buildScopes } from "../src/scopes";

test("buildScopes returns Teams chat read graph scopes plus offline_access", () => {
  expect(buildScopes()).toEqual([
    "https://graph.microsoft.com/Chat.Read",
    "https://graph.microsoft.com/User.Read.All",
    "offline_access",
  ]);
});
