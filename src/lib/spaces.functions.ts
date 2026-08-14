import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIME_OK = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

const MAX_BYTES = 10 * 1024 * 1024;

const inputSchema = z.object({
  carpeta: z.string().min(1).max(180),
  contentType: z.string().min(1),
  ext: z.string().min(1).max(8),
  size: z.number().int().positive(),
  contenidoBase64: z.string().min(1),
});

function sanitizarCarpeta(carpeta: string) {
  return carpeta
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.replace(/[^a-zA-Z0-9._-]/g, ""))
    .filter(Boolean)
    .join("/");
}

function validarArchivo(contentType: string, size: number) {
  if (!(MIME_OK as readonly string[]).includes(contentType)) {
    throw new Error("Solo se permiten imágenes (jpeg, png, webp, gif, heic)");
  }
  if (size > MAX_BYTES) throw new Error("La imagen no puede pesar más de 10 MB");
}

function nombreArchivo(carpeta: string, ext: string) {
  const limpia = sanitizarCarpeta(carpeta);
  const e = ext.replace(/^\./, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "jpg";
  return `${limpia}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${e}`;
}

function bytesDeBase64(b64: string) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export const pedirUrlSubida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    validarArchivo(data.contentType, data.size);
    const carpeta = sanitizarCarpeta(data.carpeta);
    const raiz = carpeta.split("/")[0];
    if (raiz !== "comedor" && raiz !== "campanas") {
      throw new Error("Carpeta de subida no permitida");
    }
    const { subirObjeto } = await import("@/lib/spaces.server");
    const publicUrl = await subirObjeto(
      nombreArchivo(carpeta, data.ext),
      bytesDeBase64(data.contenidoBase64),
      data.contentType,
    );
    return { publicUrl };
  });

export const pedirUrlSubidaPago = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    validarArchivo(data.contentType, data.size);
    const carpeta = sanitizarCarpeta(data.carpeta);
    if (carpeta.split("/")[0] !== "pagos") {
      throw new Error("Solo se pueden subir comprobantes a pagos/");
    }
    const { subirObjeto } = await import("@/lib/spaces.server");
    const publicUrl = await subirObjeto(
      nombreArchivo(carpeta, data.ext),
      bytesDeBase64(data.contenidoBase64),
      data.contentType,
    );
    return { publicUrl };
  });
