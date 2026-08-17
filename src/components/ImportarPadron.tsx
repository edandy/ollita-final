import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSubmitLock } from "@/lib/submit-lock";
import { importarPadron } from "@/lib/padron.functions";
import { Upload } from "lucide-react";

type Fila = {
  nombre: string;
  dni: string;
  pin: string;
  telefono: string | null;
  direccion: string | null;
  carga: number;
  activo: boolean;
};

const ALIAS: Record<string, string> = {
  nombre: "nombre", "nombre completo": "nombre", nombres: "nombre",
  dni: "dni", documento: "dni",
  pin: "pin", clave: "pin",
  telefono: "telefono", "teléfono": "telefono", celular: "telefono",
  direccion: "direccion", "dirección": "direccion",
  estado: "estado", activo: "estado",
  "carga familiar": "carga", carga_familiar: "carga", carga: "carga",
};

export function ImportarPadron({ comedorId, alTerminar }: { comedorId: string; alTerminar: () => void }) {
  const fnImportar = useServerFn(importarPadron);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const { pending: guardando, run } = useSubmitLock();
  const [resumen, setResumen] = useState<string | null>(null);

  const leer = async (file: File) => {
    setResumen(null);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]!]!;
    const crudo: any[] = XLSX.utils.sheet_to_json(hoja, { defval: "" });
    const ok: Fila[] = [];
    const errs: string[] = [];

    crudo.forEach((r, i) => {
      const n: Record<string, any> = {};
      for (const k of Object.keys(r)) {
        const clave = ALIAS[k.toString().trim().toLowerCase()];
        if (clave) n[clave] = r[k];
      }
      const nombre = String(n.nombre ?? "").trim();
      const dni = String(n.dni ?? "").replace(/\D/g, "");
      const pin = String(n.pin ?? "").replace(/\D/g, "");
      const tel = String(n.telefono ?? "").replace(/\D/g, "");
      if (!nombre) { errs.push(`Fila ${i + 2}: falta el nombre`); return; }
      if (dni.length !== 8) { errs.push(`Fila ${i + 2}: DNI inválido (${n.dni})`); return; }
      if (pin.length < 4 || pin.length > 8) { errs.push(`Fila ${i + 2}: falta el PIN`); return; }
      const estado = String(n.estado ?? "activo").trim().toLowerCase();
      ok.push({
        nombre,
        dni,
        pin,
        telefono: tel.length === 9 ? tel : null,
        direccion: String(n.direccion ?? "").trim() || null,
        carga: Number.isFinite(Number(n.carga)) ? Math.max(0, Math.trunc(Number(n.carga))) : 0,
        activo: !["inactivo", "no", "baja", "0", "false"].includes(estado),
      });
    });
    setFilas(ok);
    setErrores(errs);
  };

  const guardar = () => {
    void run(async () => {
      try {
        const result = await fnImportar({
          data: {
            comedor_id: comedorId,
            rows: filas.map((f) => ({
              nombre: f.nombre,
              dni: f.dni,
              pin: f.pin,
              telefono: f.telefono ?? undefined,
              direccion: f.direccion,
              carga: f.carga,
              activo: f.activo,
            })),
          },
        });
        const extra = [
          ...(result.errors ?? []),
          ...(result.warnings ?? []),
        ];
        setErrores(extra);
        setResumen(
          `Se importaron ${result.imported} personas al padrón` +
            (result.accountsCreated ? ` y se crearon ${result.accountsCreated} cuentas.` : "."),
        );
        setFilas([]);
        alTerminar();
      } catch (e: any) {
        setErrores((prev) => [...prev, e?.message ?? "No se pudo importar el padrón"]);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[16px] text-[#475569]">
        El archivo debe tener las columnas: nombre, dni, pin, telefono, direccion, estado y carga familiar.
        Cada persona entra con su DNI y el PIN de la fila.
      </p>
      <label className="min-h-14 w-full gap-2 inline-flex items-center justify-center rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold cursor-pointer hover:border-[#0F7BA8]">
        <Upload size={22} strokeWidth={1.75} /> Elegir archivo (.xlsx o .csv)
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); }} />
      </label>

      {errores.length > 0 && (
        <div className="bg-[#FDF0D4] rounded-2xl p-3.5 flex flex-col gap-1">
          <p className="text-[16px] font-semibold text-[#8A5A00]">{errores.length} filas con problemas (se omiten)</p>
          {errores.slice(0, 5).map((e, i) => <p key={i} className="text-[15px] text-[#8A5A00]">• {e}</p>)}
        </div>
      )}

      {filas.length > 0 && (
        <>
          <p className="text-[17px] text-[#072249] font-semibold">{filas.length} personas listas para importar</p>
          <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
            {filas.slice(0, 8).map((f, i) => (
              <p key={i} className="text-[15px] text-[#718096] truncate">{f.nombre} · DNI {f.dni}{f.telefono ? ` · ${f.telefono}` : ""}</p>
            ))}
            {filas.length > 8 && <p className="text-[15px] text-[#718096]">…y {filas.length - 8} más</p>}
          </div>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="min-h-14 w-full rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-50"
          >
            {guardando ? "Importando…" : `Importar ${filas.length} personas`}
          </button>
        </>
      )}

      {resumen && <p className="text-[16px] text-[#0F7BA8] font-semibold">{resumen}</p>}
    </div>
  );
}
