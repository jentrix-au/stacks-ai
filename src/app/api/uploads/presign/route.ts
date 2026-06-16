import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTaskAccess } from "@/lib/authz";
import { presignUpload, publicUrl, r2Key } from "@/lib/r2";

const Body = z.object({
  taskId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(parsed.error.format(), { status: 400 });
  }
  const data = parsed.data;
  await requireTaskAccess(session.user.id, data.taskId);

  const key = r2Key(`tasks/${data.taskId}`, data.name);

  const attachment = await db.attachment.create({
    data: {
      taskId: data.taskId,
      uploaderId: session.user.id,
      name: data.name,
      mimeType: data.mimeType,
      size: data.size,
      width: data.width,
      height: data.height,
      r2Key: key,
      status: "PENDING",
    },
  });

  try {
    const uploadUrl = await presignUpload(key, data.mimeType);
    return NextResponse.json({
      attachmentId: attachment.id,
      uploadUrl,
      publicUrl: publicUrl(key),
      key,
    });
  } catch (err) {
    // Clean up the PENDING attachment so we don't leak rows.
    await db.attachment.delete({ where: { id: attachment.id } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Presign failed" },
      { status: 503 },
    );
  }
}
