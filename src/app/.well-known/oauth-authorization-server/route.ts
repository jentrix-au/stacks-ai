import { NextResponse } from "next/server";

import { TOKEN_SCOPES } from "@/lib/token-scopes";

// RFC 8414 Authorization Server Metadata (P2.7). Minimal AS: authorization
// code + PKCE S256 + refresh rotation, public clients only (no client
// secret — CIMD identifies clients by their https client_id URL).

export function GET() {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...TOKEN_SCOPES],
      // CIMD (client_id = metadata document URL) — MCP auth guidance 2025-11-25.
      client_id_metadata_document_supported: true,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
