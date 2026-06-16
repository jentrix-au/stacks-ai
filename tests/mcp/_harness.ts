import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { registerPrompts } from "@/lib/mcp/prompts";
import { registerResources } from "@/lib/mcp/resources";
import { registerTools } from "@/lib/mcp/tools";

/** AuthInfo equivalent to what verifyBearerToken produces for a full token. */
export function testAuth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    token: "tm_test",
    clientId: "user_1",
    scopes: ["read", "write", "admin"],
    extra: { userId: "user_1", tokenId: "tok_1" },
    ...overrides,
  };
}

/**
 * In-process MCP server + client over linked InMemoryTransports. The client
 * transport injects `authInfo` on every message — the same way withMcpAuth
 * attaches it per HTTP request in production.
 */
export async function connectMcp(authInfo: AuthInfo = testAuth()) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const originalSend = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) =>
    originalSend(message, { ...options, authInfo });

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}
