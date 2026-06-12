// Teams chat read = Chat.Read + User.Read.All (per the reference app registration),
// prefixed with the Graph resource, plus offline_access to mint refresh tokens.
const GRAPH = "https://graph.microsoft.com";
const TEAMS_CHAT_READ = ["Chat.Read", "User.Read.All"];

export function buildScopes(): string[] {
  return [...TEAMS_CHAT_READ.map((s) => `${GRAPH}/${s}`), "offline_access"];
}
