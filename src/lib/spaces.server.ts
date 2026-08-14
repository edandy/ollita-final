import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSpacesConfig } from "@/lib/config.server";

function clienteSpaces() {
  const cfg = getSpacesConfig();
  return {
    cfg,
    s3: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: false,
      credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

export function urlPublica(path: string) {
  const cfg = getSpacesConfig();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  if (cfg.cdnUrl) return `${cfg.cdnUrl}/${encoded}`;
  return `https://${cfg.bucket}.${cfg.region}.digitaloceanspaces.com/${encoded}`;
}

export async function subirObjeto(path: string, body: Uint8Array, contentType: string) {
  const { cfg, s3 } = clienteSpaces();
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: path,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  return urlPublica(path);
}
