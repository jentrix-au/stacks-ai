"use client";

import { finalizeUpload, removeAttachment } from "@/server/actions/attachments";

export interface PresignResponse {
  attachmentId: string;
  uploadUrl: string;
  publicUrl: string | null;
  key: string;
}

async function imageDimensions(
  file: File,
): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadAttachment(
  taskId: string,
  file: File,
): Promise<PresignResponse> {
  const dims = await imageDimensions(file);
  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      ...(dims ? { width: dims.w, height: dims.h } : {}),
    }),
  });
  if (!presignRes.ok) {
    const text = await presignRes.text();
    throw new Error(`Presign failed: ${text || presignRes.status}`);
  }
  const presign = (await presignRes.json()) as PresignResponse;

  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) {
    await removeAttachment({ attachmentId: presign.attachmentId }).catch(
      () => {},
    );
    throw new Error(`Upload failed: ${putRes.status}`);
  }

  await finalizeUpload({ attachmentId: presign.attachmentId });
  return presign;
}
