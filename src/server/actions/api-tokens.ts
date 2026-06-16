"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { OAUTH_TOKEN_PREFIX, generateToken } from "@/lib/api-tokens";
import { requireWorkspaceRole } from "@/lib/authz";
import { requireUser } from "@/lib/session";
import { TOKEN_SCOPES } from "@/lib/token-scopes";

const DEFAULT_EXPIRES_DAYS = 90;
const MAX_EXPIRES_DAYS = 365;

const CreateTokenSchema = z.object({
  name: z.string().min(1).max(80),
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_EXPIRES_DAYS)
    .optional(),
  // New tokens always carry explicit scopes — only pre-scope tokens are
  // grandfathered as full access (empty array in the DB).
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
  // Null/absent = token works across all the user's workspaces.
  workspaceId: z.string().min(1).nullable().optional(),
  // Agent identity (P4.1): teammate-facing badge name + emoji avatar.
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  emoji: z.string().trim().min(1).max(16).nullable().optional(),
});

/**
 * OAuth access tokens (tmo_) are 1-hour bearers that rotate constantly —
 * each refresh revokes the old row and mints a new one, so dead ones pile
 * up fast and can never be revived. Hide them from token lists; revoked
 * PATs stay visible for audit.
 */
const hideDeadOAuthTokens = () => ({
  NOT: {
    tokenPrefix: { startsWith: OAUTH_TOKEN_PREFIX },
    OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
  },
});

export async function listApiTokens() {
  const user = await requireUser();
  const tokens = await db.apiToken.findMany({
    where: { userId: user.id, ...hideDeadOAuthTokens() },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      workspace: { select: { id: true, name: true } },
      displayName: true,
      emoji: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  // P2.8: 7-day usage rollup + the token's most recent attributed actions.
  const since = new Date(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const usage = await db.apiTokenUsage.findMany({
    where: { tokenId: { in: tokens.map((t) => t.id) }, day: { gte: since } },
    select: { tokenId: true, requests: true, mutations: true },
  });
  const usageByToken = new Map<
    string,
    { requests: number; mutations: number }
  >();
  for (const u of usage) {
    const agg = usageByToken.get(u.tokenId) ?? { requests: 0, mutations: 0 };
    agg.requests += u.requests;
    agg.mutations += u.mutations;
    usageByToken.set(u.tokenId, agg);
  }
  const recentByToken = await Promise.all(
    tokens.map((t) =>
      db.activity.findMany({
        where: { payload: { path: ["tokenId"], equals: t.id } },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          type: true,
          createdAt: true,
          task: {
            select: {
              number: true,
              workspace: { select: { taskPrefix: true } },
            },
          },
        },
      }),
    ),
  );

  return tokens.map((t, i) => ({
    ...t,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    usage7d: usageByToken.get(t.id) ?? { requests: 0, mutations: 0 },
    recentActions: recentByToken[i].map((a) => ({
      type: a.type as string,
      createdAt: a.createdAt.toISOString(),
      taskKey: `${a.task.workspace.taskPrefix}-${a.task.number}`,
    })),
  }));
}

export async function createApiToken(input: z.infer<typeof CreateTokenSchema>) {
  const user = await requireUser();
  const data = CreateTokenSchema.parse(input);
  if (data.workspaceId) {
    // Any member may scope a token to a workspace they belong to — the token
    // can never exceed the user's own role, since ops re-check it per call.
    await requireWorkspaceRole(user.id, data.workspaceId);
  }
  const days = data.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const { token, hash, prefix } = generateToken();
  const row = await db.apiToken.create({
    data: {
      userId: user.id,
      name: data.name,
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: data.scopes,
      workspaceId: data.workspaceId ?? null,
      displayName: data.displayName ?? null,
      emoji: data.emoji ?? null,
      expiresAt,
    },
    select: { id: true, name: true, tokenPrefix: true, expiresAt: true },
  });
  revalidatePath("/account/tokens");
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    token,
  };
}

export async function revokeApiToken(id: string) {
  const user = await requireUser();
  const tokenId = z.string().min(1).parse(id);
  const result = await db.apiToken.updateMany({
    where: { id: tokenId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/account/tokens");
  return { revoked: result.count > 0 };
}

// ---------------------------------------------------------------------------
// Workspace token governance: admins see and revoke tokens PINNED to their
// workspace. Unpinned tokens never appear here — they're personal,
// cross-workspace credentials; the kill switch for those is removing the
// member, since every op re-checks the owner's role at call time.
// ---------------------------------------------------------------------------

const WorkspaceTokensSchema = z.object({ workspaceId: z.string().min(1) });

export async function listWorkspaceTokens(input: { workspaceId: string }) {
  const user = await requireUser();
  const { workspaceId } = WorkspaceTokensSchema.parse(input);
  await requireWorkspaceRole(user.id, workspaceId, Role.ADMIN);

  const tokens = await db.apiToken.findMany({
    where: { workspaceId, ...hideDeadOAuthTokens() },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      displayName: true,
      emoji: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return tokens.map((t) => ({
    ...t,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }));
}

const RevokeWorkspaceTokenSchema = z.object({
  workspaceId: z.string().min(1),
  tokenId: z.string().min(1),
});

export async function revokeWorkspaceToken(input: {
  workspaceId: string;
  tokenId: string;
}) {
  const user = await requireUser();
  const { workspaceId, tokenId } = RevokeWorkspaceTokenSchema.parse(input);
  await requireWorkspaceRole(user.id, workspaceId, Role.ADMIN);

  // workspaceId in the WHERE clause: the admin can only ever hit tokens
  // pinned to the workspace their role was just checked against — a token id
  // from another workspace (or an unpinned one) is a no-op, mirroring the
  // userId guard in revokeApiToken above.
  const result = await db.apiToken.updateMany({
    where: { id: tokenId, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (ws) revalidatePath(`/${ws.slug}/settings`);
  // The owner's own token page shows the same row.
  revalidatePath("/account/tokens");
  return { revoked: result.count > 0 };
}
