import { AttachmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/r2";

export async function listTaskAttachments(taskId: string) {
  const rows = await db.attachment.findMany({
    where: { taskId, status: AttachmentStatus.READY },
    orderBy: { createdAt: "desc" },
    include: {
      uploader: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
  return rows.map((r) => ({
    ...r,
    url: publicUrl(r.r2Key),
  }));
}

export type TaskAttachment = Awaited<
  ReturnType<typeof listTaskAttachments>
>[number];
