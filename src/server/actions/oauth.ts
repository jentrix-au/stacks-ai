"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWorkspaceRole } from "@/lib/authz";
import { resolveClient } from "@/lib/oauth/cimd";
import { issueAuthCode } from "@/lib/oauth/service";
import { requireUser } from "@/lib/session";
import { TOKEN_SCOPES } from "@/lib/token-scopes";

const ApproveSchema = z.object({
  clientId: z.string().url(),
  redirectUri: z.string().url(),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
  workspaceId: z.string().min(1).nullable(),
  state: z.string().max(2000).nullable(),
  codeChallenge: z.string().min(43).max(128),
});

/**
 * Consent approval (P2.7). Everything is re-validated server-side — the
 * form's hidden fields are untrusted: the client must still resolve, the
 * redirect_uri must still be registered, and workspace membership is
 * checked before scoping a grant to it.
 */
export async function approveAuthorization(
  input: z.infer<typeof ApproveSchema>,
) {
  const user = await requireUser();
  const data = ApproveSchema.parse(input);

  const client = await resolveClient(data.clientId);
  if (!client.redirectUris.includes(data.redirectUri)) {
    throw new Error("redirect_uri is not registered for this client");
  }
  if (data.workspaceId) {
    await requireWorkspaceRole(user.id, data.workspaceId);
  }

  const code = await issueAuthCode({
    clientDbId: client.id,
    userId: user.id,
    redirectUri: data.redirectUri,
    scopes: data.scopes,
    workspaceId: data.workspaceId,
    codeChallenge: data.codeChallenge,
  });

  const target = new URL(data.redirectUri);
  target.searchParams.set("code", code);
  if (data.state) target.searchParams.set("state", data.state);
  redirect(target.toString());
}

const DenySchema = z.object({
  redirectUri: z.string().url(),
  clientId: z.string().url(),
  state: z.string().max(2000).nullable(),
});

export async function denyAuthorization(input: z.infer<typeof DenySchema>) {
  await requireUser();
  const data = DenySchema.parse(input);
  // Only redirect to registered URIs, even on deny.
  const client = await resolveClient(data.clientId);
  if (!client.redirectUris.includes(data.redirectUri)) {
    throw new Error("redirect_uri is not registered for this client");
  }
  const target = new URL(data.redirectUri);
  target.searchParams.set("error", "access_denied");
  if (data.state) target.searchParams.set("state", data.state);
  redirect(target.toString());
}
