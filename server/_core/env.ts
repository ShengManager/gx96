export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** CloudWave / S3-compatible (e.g. https://s3.ap-southeast-1.cloudwave-s3.com) */
  cloudwaveS3Endpoint: process.env.CLOUDWAVE_S3_ENDPOINT ?? "",
  cloudwaveS3Region: process.env.CLOUDWAVE_S3_REGION ?? "ap-southeast-1",
  cloudwaveS3Bucket: process.env.CLOUDWAVE_S3_BUCKET ?? "",
  cloudwaveS3AccessKey: process.env.CLOUDWAVE_S3_ACCESS_KEY ?? "",
  cloudwaveS3SecretKey: process.env.CLOUDWAVE_S3_SECRET_KEY ?? "",
  /** Optional: virtual-host style base, e.g. https://gt96-image.s3.ap-southeast-1.cloudwave-s3.com */
  cloudwaveS3PublicUrlBase: process.env.CLOUDWAVE_S3_PUBLIC_URL_BASE ?? "",
  /** e.g. public-read — set CLOUDWAVE_S3_OBJECT_ACL= to omit ACL */
  cloudwaveS3ObjectAcl:
    process.env.CLOUDWAVE_S3_OBJECT_ACL !== undefined
      ? process.env.CLOUDWAVE_S3_OBJECT_ACL
      : "public-read",
};
