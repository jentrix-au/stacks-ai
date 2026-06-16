import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";

// Path-aware RFC 9728 PRM variant: spec-strict clients derive the metadata
// URL from the resource path (/api/mcp), so serve it here too.

const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const handler = protectedResourceHandler({
  authServerUrls: [origin],
  resourceUrl: `${origin}/api/mcp`,
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
