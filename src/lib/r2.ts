import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

function r2Client(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // AWS SDK v3 ≥3.700 signs an `x-amz-checksum-crc32` header by default.
    // R2 doesn't always accept it and CORS would have to allow the extra
    // header. Disable for browser PUTs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
}

const BUCKET = () => process.env.R2_BUCKET ?? "stacks-attachments";

export async function presignUpload(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: 60 * 5 });
}

export const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * Short-lived signed GET URL (5 min) for agent downloads. Falls back to the
 * public URL when R2 credentials are absent (dev), or null when neither is
 * configured.
 */
export async function presignDownload(key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
    return await getSignedUrl(r2Client(), command, {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  } catch {
    return publicUrl(key);
  }
}

export async function deleteObject(key: string) {
  await r2Client().send(
    new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }),
  );
}

export function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}

export function r2Key(scope: string, originalName: string) {
  const ext = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf(".") + 1)
    : "bin";
  const id = crypto.randomUUID();
  return `${scope}/${id}.${ext.toLowerCase()}`;
}
