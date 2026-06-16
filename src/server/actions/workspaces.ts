"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireWorkspaceRole, AuthzError } from "@/lib/authz";
import { taskPrefixFromSlug, uniqueSlug } from "@/lib/slug";
import { sendInvitationEmail } from "@/lib/email";

const CreateWorkspace = z.object({
  name: z.string().min(1).max(80),
});

export async function createWorkspace(formData: FormData) {
  const user = await requireUser();
  const data = CreateWorkspace.parse({ name: formData.get("name") });

  const slug = await uniqueSlug(data.name, async (candidate) => {
    const hit = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return !!hit;
  });

  const workspace = await db.workspace.create({
    data: {
      name: data.name,
      slug,
      taskPrefix: taskPrefixFromSlug(slug),
      members: { create: { userId: user.id, role: Role.OWNER } },
      counter: { create: {} },
    },
  });

  revalidatePath("/");
  redirect(`/${workspace.slug}`);
}

const RenameWorkspace = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export async function renameWorkspace(formData: FormData) {
  const user = await requireUser();
  const data = RenameWorkspace.parse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
  });
  await requireWorkspaceRole(user.id, data.workspaceId, Role.ADMIN);
  const ws = await db.workspace.update({
    where: { id: data.workspaceId },
    data: { name: data.name },
  });
  revalidatePath(`/${ws.slug}`);
}

const InviteMember = z.object({
  workspaceId: z.string().min(1),
  email: z.email(),
  role: z.enum(Role).default(Role.MEMBER),
});

export async function inviteMember(formData: FormData) {
  const user = await requireUser();
  const data = InviteMember.parse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    role: formData.get("role") ?? Role.MEMBER,
  });
  // Only an owner can mint an owner invite; otherwise admin suffices.
  const required = data.role === Role.OWNER ? Role.OWNER : Role.ADMIN;
  await requireWorkspaceRole(user.id, data.workspaceId, required);

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const email = data.email.toLowerCase();

  const [, ws, inviter] = await db.$transaction([
    db.invitation.create({
      data: {
        workspaceId: data.workspaceId,
        email,
        role: data.role,
        token,
        invitedById: user.id,
        expiresAt,
      },
    }),
    db.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { slug: true, name: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    }),
  ]);

  if (ws) revalidatePath(`/${ws.slug}/members`);

  const result = await sendInvitationEmail({
    to: email,
    workspaceName: ws?.name ?? "the workspace",
    inviterName: inviter?.name ?? inviter?.email ?? null,
    role: data.role,
    token,
  });

  return {
    emailSent: result.sent,
    emailError: result.sent ? null : (result.error ?? null),
  };
}

const ResendInvitation = z.object({
  invitationId: z.string().min(1),
});

export async function resendInvitation(formData: FormData) {
  const user = await requireUser();
  const data = ResendInvitation.parse({
    invitationId: formData.get("invitationId"),
  });

  const invitation = await db.invitation.findUnique({
    where: { id: data.invitationId },
  });
  if (!invitation) throw new AuthzError("Invitation not found", 404);
  if (invitation.acceptedAt) throw new AuthzError("Invitation already used");

  const required = invitation.role === Role.OWNER ? Role.OWNER : Role.ADMIN;
  await requireWorkspaceRole(user.id, invitation.workspaceId, required);

  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [, ws, inviter] = await db.$transaction([
    db.invitation.update({
      where: { id: invitation.id },
      data: { token: newToken, expiresAt, invitedById: user.id },
    }),
    db.workspace.findUnique({
      where: { id: invitation.workspaceId },
      select: { slug: true, name: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    }),
  ]);

  if (ws) revalidatePath(`/${ws.slug}/members`);

  const result = await sendInvitationEmail({
    to: invitation.email,
    workspaceName: ws?.name ?? "the workspace",
    inviterName: inviter?.name ?? inviter?.email ?? null,
    role: invitation.role,
    token: newToken,
  });

  return {
    emailSent: result.sent,
    emailError: result.sent ? null : (result.error ?? null),
  };
}

const RevokeInvitation = z.object({
  invitationId: z.string().min(1),
});

export async function revokeInvitation(formData: FormData) {
  const user = await requireUser();
  const data = RevokeInvitation.parse({
    invitationId: formData.get("invitationId"),
  });

  const invitation = await db.invitation.findUnique({
    where: { id: data.invitationId },
    select: { workspaceId: true },
  });
  if (!invitation) throw new AuthzError("Invitation not found", 404);
  await requireWorkspaceRole(user.id, invitation.workspaceId, Role.ADMIN);

  await db.invitation.delete({ where: { id: data.invitationId } });

  const ws = await db.workspace.findUnique({
    where: { id: invitation.workspaceId },
    select: { slug: true },
  });
  if (ws) revalidatePath(`/${ws.slug}/members`);
}

export async function acceptInvitation(token: string) {
  const user = await requireUser();

  const invitation = await db.invitation.findUnique({
    where: { token },
  });
  if (!invitation) throw new AuthzError("Invitation not found", 404);
  if (invitation.acceptedAt) throw new AuthzError("Invitation already used");
  if (invitation.expiresAt < new Date())
    throw new AuthzError("Invitation expired");

  const userEmail = user.email?.toLowerCase();
  if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
    throw new AuthzError("This invitation is for a different email");
  }

  await db.$transaction([
    db.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
        },
      },
      create: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
      update: {},
    }),
    db.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  const ws = await db.workspace.findUnique({
    where: { id: invitation.workspaceId },
    select: { slug: true },
  });
  if (ws) redirect(`/${ws.slug}`);
}

const RemoveMember = z.object({
  workspaceId: z.string().min(1),
  memberUserId: z.string().min(1),
});

export async function removeMember(formData: FormData) {
  const user = await requireUser();
  const data = RemoveMember.parse({
    workspaceId: formData.get("workspaceId"),
    memberUserId: formData.get("memberUserId"),
  });
  await requireWorkspaceRole(user.id, data.workspaceId, Role.ADMIN);

  // Prevent removing the last owner.
  const target = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: data.memberUserId,
        workspaceId: data.workspaceId,
      },
    },
  });
  if (target?.role === Role.OWNER) {
    await requireWorkspaceRole(user.id, data.workspaceId, Role.OWNER);
    const owners = await db.workspaceMember.count({
      where: { workspaceId: data.workspaceId, role: Role.OWNER },
    });
    if (owners <= 1) throw new AuthzError("Cannot remove the last owner");
  }

  await db.workspaceMember.delete({
    where: {
      userId_workspaceId: {
        userId: data.memberUserId,
        workspaceId: data.workspaceId,
      },
    },
  });

  const ws = await db.workspace.findUnique({
    where: { id: data.workspaceId },
    select: { slug: true },
  });
  if (ws) revalidatePath(`/${ws.slug}/members`);
}

const ChangeRole = z.object({
  workspaceId: z.string().min(1),
  memberUserId: z.string().min(1),
  role: z.enum(Role),
});

export async function changeRole(formData: FormData) {
  const user = await requireUser();
  const data = ChangeRole.parse({
    workspaceId: formData.get("workspaceId"),
    memberUserId: formData.get("memberUserId"),
    role: formData.get("role"),
  });
  await requireWorkspaceRole(user.id, data.workspaceId, Role.OWNER);

  // Prevent demoting the last owner.
  const target = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: data.memberUserId,
        workspaceId: data.workspaceId,
      },
    },
    select: { role: true },
  });
  if (!target) throw new AuthzError("Member not found", 404);
  if (target.role === Role.OWNER && data.role !== Role.OWNER) {
    const owners = await db.workspaceMember.count({
      where: { workspaceId: data.workspaceId, role: Role.OWNER },
    });
    if (owners <= 1) throw new AuthzError("Cannot demote the last owner");
  }

  await db.workspaceMember.update({
    where: {
      userId_workspaceId: {
        userId: data.memberUserId,
        workspaceId: data.workspaceId,
      },
    },
    data: { role: data.role },
  });

  const ws = await db.workspace.findUnique({
    where: { id: data.workspaceId },
    select: { slug: true },
  });
  if (ws) revalidatePath(`/${ws.slug}/members`);
}
