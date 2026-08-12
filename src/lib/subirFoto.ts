import { supabase } from "@/integrations/supabase/client";

// Sube una imagen al bucket privado "fotos" y devuelve una URL firmada de larga duración.
export async function subirFoto(file: File, carpeta: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage.from("fotos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase.storage
    .from("fotos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 años
  if (error || !data?.signedUrl) throw error ?? new Error("No se pudo generar la URL");
  return data.signedUrl;
}