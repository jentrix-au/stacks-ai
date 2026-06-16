import { NextResponse } from "next/server";

import {
  exchangeAuthorizationCode,
  OAuthGrantError,
  rotateRefreshToken,
  type TokenPair,
} from "@/lib/oauth/service";

// OAuth 2.1 token endpoint (P2.7): authorization_code (PKCE S256 mandatory)
// and refresh_token (rotation). Public clients only — no client secret;
// the client is identified by its CIMD client_id URL.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function tokenResponse(pair: TokenPair) {
  return NextResponse.json(
    {
      access_token: pair.accessToken,
      token_type: "Bearer",
      expires_in: pair.expiresInSeconds,
      refresh_token: pair.refreshToken,
      scope: pair.scopes.join(" "),
    },
    { headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

function errorResponse(code: string, description: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      params = new URLSearchParams(
        Object.entries((await req.json()) as Record<string, string>),
      );
    } else {
      params = new URLSearchParams(await req.text());
    }
  } catch {
    return errorResponse("invalid_request", "Malformed request body");
  }

  const grantType = params.get("grant_type");
  const clientId = params.get("client_id");
  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  try {
    if (grantType === "authorization_code") {
      const code = params.get("code");
      const codeVerifier = params.get("code_verifier");
      const redirectUri = params.get("redirect_uri");
      if (!code || !codeVerifier || !redirectUri) {
        return errorResponse(
          "invalid_request",
          "code, code_verifier, and redirect_uri are required",
        );
      }
      const pair = await exchangeAuthorizationCode({
        code,
        codeVerifier,
        clientId,
        redirectUri,
      });
      return tokenResponse(pair);
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token");
      if (!refreshToken) {
        return errorResponse("invalid_request", "refresh_token is required");
      }
      const pair = await rotateRefreshToken({ refreshToken, clientId });
      return tokenResponse(pair);
    }

    return errorResponse(
      "unsupported_grant_type",
      "Use authorization_code or refresh_token",
    );
  } catch (e) {
    if (e instanceof OAuthGrantError) {
      return errorResponse(e.code, e.message);
    }
    console.error("oauth token endpoint error", e);
    return errorResponse("server_error", "Unexpected error", 500);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export const runtime = "nodejs";
