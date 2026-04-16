import { S3Client, PutObjectCommand, GetObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let client: S3Client | null = null;

export function isCloudwaveS3Configured(): boolean {
  return Boolean(
    ENV.cloudwaveS3Endpoint &&
      ENV.cloudwaveS3Region &&
      ENV.cloudwaveS3Bucket &&
      ENV.cloudwaveS3AccessKey &&
      ENV.cloudwaveS3SecretKey
  );
}

function getClient(): S3Client {
  if (client) return client;
  if (!isCloudwaveS3Configured()) {
    throw new Error("CloudWave S3 is not configured (set CLOUDWAVE_S3_* env vars)");
  }
  client = new S3Client({
    region: ENV.cloudwaveS3Region!,
    endpoint: ENV.cloudwaveS3Endpoint!.replace(/\/+$/, ""),
    forcePathStyle: true,
    credentials: {
      accessKeyId: ENV.cloudwaveS3AccessKey!,
      secretAccessKey: ENV.cloudwaveS3SecretKey!,
    },
  });
  return client;
}

/** Public URL for browser access (bucket must allow read, or use CDN base). */
export function buildCloudwaveObjectPublicUrl(objectKey: string): string {
  const key = objectKey.replace(/^\/+/, "");
  const base = (ENV.cloudwaveS3PublicUrlBase || "").replace(/\/+$/, "");
  if (base) {
    return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  const ep = ENV.cloudwaveS3Endpoint!.replace(/\/+$/, "");
  const bucket = ENV.cloudwaveS3Bucket!;
  return `${ep}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function cloudwaveS3Put(
  objectKey: string,
  body: Buffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = objectKey.replace(/^\/+/, "");
  const input: PutObjectCommandInput = {
    Bucket: ENV.cloudwaveS3Bucket!,
    Key: key,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  };
  if (ENV.cloudwaveS3ObjectAcl) {
    input.ACL = ENV.cloudwaveS3ObjectAcl as PutObjectCommandInput["ACL"];
  }
  await getClient().send(new PutObjectCommand(input));
  return { key, url: buildCloudwaveObjectPublicUrl(key) };
}

export async function cloudwaveS3GetSignedUrl(objectKey: string, expiresInSeconds = 3600): Promise<string> {
  const key = objectKey.replace(/^\/+/, "");
  const cmd = new GetObjectCommand({
    Bucket: ENV.cloudwaveS3Bucket!,
    Key: key,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: Math.max(60, Math.min(expiresInSeconds, 7 * 24 * 3600)) });
}

export function tryExtractCloudwaveObjectKeyFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const endpointHost = (ENV.cloudwaveS3Endpoint || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const bucket = ENV.cloudwaveS3Bucket || "";

    // Path-style: https://s3.../bucket/key
    if (endpointHost && u.host === endpointHost) {
      const p = u.pathname.replace(/^\/+/, "");
      if (bucket && p.startsWith(`${bucket}/`)) {
        return decodeURIComponent(p.slice(bucket.length + 1));
      }
    }

    // Virtual-host style: https://bucket.s3.../key
    if (bucket && u.host.startsWith(`${bucket}.`)) {
      return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    }
  } catch {
    // ignore
  }
  return null;
}
