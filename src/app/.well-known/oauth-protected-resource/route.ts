import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";

// RFC 9728 Protected Resource Metadata (P2.7). withMcpAuth's 401s point
// clients here via WWW-Authenticate resource_metadata; we are our own
// authorization server.

const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const handler = protectedResourceHandler({
  authServerUrls: [origin],
  resourceUrl: origin,
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
