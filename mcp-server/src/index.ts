import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMeetingTools } from "./tools/meetings.ts";
import { registerHighlightTools } from "./tools/highlights.ts";
import { registerSummarizationTools } from "./tools/summarization.ts";
import { registerContributionTools } from "./tools/contributions.ts";
import { registerMeetingResources } from "./resources/meetings.ts";

const server = new McpServer({
  name: "meeting-tool",
  version: "0.1.0",
});

registerMeetingTools(server);
registerHighlightTools(server);
registerSummarizationTools(server);
registerContributionTools(server);
registerMeetingResources(server);

const transport = new StdioServerTransport();
await server.connect(transport);
