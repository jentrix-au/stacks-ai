import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { registerPrompts } from "@/lib/mcp/prompts";
import { registerResources } from "@/lib/mcp/resources";
import { registerTools } from "@/lib/mcp/tools";
import { verifyBearerToken } from "@/lib/mcp/verify-token";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
    registerResources(server);
    registerPrompts(server);
  },
  {
    serverInfo: { name: "task-manager", version: "0.1.0" },
  },
  {
    basePath: "/api",
    maxDuration: 30,
    disableSse: true,
  },
);

const authed = withMcpAuth(handler, verifyBearerToken, {
  required: true,
  resourceUrl: process.env.NEXT_PUBLIC_APP_URL,
});

export { authed as GET, authed as POST, authed as DELETE };
export const runtime = "nodejs";
export const maxDuration = 30;
