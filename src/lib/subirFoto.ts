import { pedirUrlSubida, pedirUrlSubidaPago } from "@/lib/spaces.functions";

function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const coma = result.indexOf(",");
      resolve(coma >= 0 ? result.slice(coma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function subirFoto(file: File, carpeta: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const contentType = file.type || "image/jpeg";
  const contenidoBase64 = await archivoABase64(file);
  const payload = { carpeta, contentType, ext, size: file.size, contenidoBase64 };
  const esPago = carpeta === "pagos" || carpeta.startsWith("pagos/");
  const res = esPago
    ? await pedirUrlSubidaPago({ data: payload })
    : await pedirUrlSubida({ data: payload });
  return res.publicUrl;
}
