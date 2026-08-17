import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { ImportarPadron } from "@/components/ImportarPadron";
import { useSubmitLock } from "@/lib/submit-lock";
import { UserPlus, Upload, Search, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCta, PanelField, PanelOverlay, panelInputClass, PanelWriteGate,
} from "@/components/panel-ui";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { crearBeneficiario, sincronizarEquipoEnPadron } from "@/lib/padron.functions";
import {
  canRemoveBeneficiary,
  friendlyCreateBeneficiaryError,
  padronStaffCargo,
  validateCreateBeneficiary,
  validateUpdateBeneficiary,
} from "@/lib/padron";
import { CARGO_LABEL, type Cargo } from "@/lib/permisos";

export const Route = createFileRoute("/_authenticated/panel/padron")({
  head: () => ({ meta: [{ title: "Padrón — La Ollita" }] }),
  component: PadronPage,
});

type B = {
  id: string;
  nombre_completo: string;
  dni: string;
  telefono: string | null;
  categoria: "socia_familia" | "publico_recurrente" | "caso_social";
  subtipo_caso_social: string | null;
  vigencia_hasta: string | null;
  activo: boolean;
  carga_familiar: number;
};

const CAT_LABEL: Record<string, string> = {
  socia_familia: "Socias y familias",
  publico_recurrente: "Público recurrente",
  caso_social: "Casos sociales",
};

const CAT_CHIP: Record<string, string> = {
  socia_familia: "Socia",
  publico_recurrente: "Recurrente",
  caso_social: "Caso social",
};

function chipCat(cat: string) {
  if (cat === "caso_social") return "bg-[rgba(52,168,83,0.14)] text-[#248341]";
  if (cat === "socia_familia") return "bg-[#C5EBF9] text-[#072249]";
  return "bg-[#F0F0F0] text-[#475569]";
}

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[1]![0]!).toUpperCase();
}

function chipMes(active: boolean) {
  return `min-h-[52px] px-5 rounded-full text-[16px] font-semibold border ${
    active
      ? "bg-[#0F7BA8] border-[#0F7BA8] text-white"
      : "bg-white border-[#E0E0E0] text-[#475569]"
  }`;
}

function PadronPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const fnSyncEquipo = useServerFn(sincronizarEquipoEnPadron);
  const [lista, setLista] = useState<B[]>([]);
  const [cargoPorDni, setCargoPorDni] = useState<Record<string, Cargo>>({});
  const [dniBusq, setDniBusq] = useState("");
  const [edicion, setEdicion] = useState<{ open: boolean; b?: B }>({ open: false });
  const [importar, setImportar] = useState(false);
  const [mesOffset, setMesOffset] = useState(0);
  const [entregasMes, setEntregasMes] = useState(0);

  const cargar = async () => {
    if (!comedor) return;
    if (canWrite) {
      try { await fnSyncEquipo({ data: { comedor_id: comedor.id } }); } catch { /* noop */ }
    }
    const [{ data }, { data: staff }] = await Promise.all([
      supabase
        .from("beneficiarios")
        .select("*")
        .eq("comedor_id", comedor.id)
        .order("nombre_completo"),
      supabase
        .from("usuarios_comedor")
        .select("dni, cargo")
        .eq("comedor_id", comedor.id)
        .neq("cargo", "socia"),
    ]);
    setLista((data as B[]) ?? []);
    const map: Record<string, Cargo> = {};
    for (const row of staff ?? []) {
      if (row.dni && padronStaffCargo(row.cargo)) map[row.dni] = row.cargo as Cargo;
    }
    setCargoPorDni(map);
  };
  useEffect(() => {
    cargar();
  }, [comedor?.id]);

  const activos = lista.filter((b) => b.activo);
  const porCat = useMemo(() => {
    const m: Record<string, number> = {
      socia_familia: 0,
      publico_recurrente: 0,
      caso_social: 0,
    };
    for (const b of activos) m[b.categoria] = (m[b.categoria] ?? 0) + 1;
    return m;
  }, [activos]);

  const obs = useMemo(() => {
    const out: string[] = [];
    const dnis = new Set<string>();
    for (const b of lista) {
      if (dnis.has(b.dni)) out.push(`DNI duplicado: ${b.dni}`);
      dnis.add(b.dni);
      if (b.categoria === "caso_social" && b.vigencia_hasta && new Date(b.vigencia_hasta) < new Date()) {
        out.push(`${b.nombre_completo}: vigencia vencida (${b.vigencia_hasta})`);
      }
    }
    return out;
  }, [lista]);

  const filtrados = useMemo(() => {
    const q = dniBusq.trim();
    if (!q) return activos;
    return activos.filter((b) => b.dni.includes(q));
  }, [activos, dniBusq]);

  const meses = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("es-PE", { month: "long" });
      return {
        offset: i,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        year: d.getFullYear(),
        month: d.getMonth(),
      };
    });
  }, []);

  const mesActivo = meses[mesOffset] ?? meses[0]!;

  useEffect(() => {
    if (!comedor) return;
    const run = async () => {
      const desde = new Date(mesActivo.year, mesActivo.month, 1);
      const hasta = new Date(mesActivo.year, mesActivo.month + 1, 0);
      const desdeISO = desde.toISOString().slice(0, 10);
      const hastaISO = hasta.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("reservas")
        .select("cantidad, estado, menu:menus!inner(fecha)")
        .eq("comedor_id", comedor.id)
        .eq("estado", "recogida")
        .gte("menu.fecha", desdeISO)
        .lte("menu.fecha", hastaISO);
      const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.cantidad || 0), 0);
      setEntregasMes(total);
    };
    run();
  }, [comedor?.id, mesActivo.year, mesActivo.month]);

  const mesResumen = (() => {
    const ahora = new Date();
    const esActual = mesOffset === 0;
    const nombre = mesActivo.label.toLowerCase();
    if (esActual) {
      return `Del 1 al ${ahora.getDate()} de ${nombre}`;
    }
    return `Mes completo de ${nombre}`;
  })();

  const exportarMes = async () => {
    if (!comedor) return;
    const desde = new Date(mesActivo.year, mesActivo.month, 1);
    const hasta = new Date(mesActivo.year, mesActivo.month + 1, 0);
    const desdeISO = desde.toISOString().slice(0, 10);
    const hastaISO = hasta.toISOString().slice(0, 10);
    const { data } = await supabase
      .from("reservas")
      .select("codigo, nombre_comensal, dni, cantidad, estado, created_at, menu:menus!inner(fecha)")
      .eq("comedor_id", comedor.id)
      .eq("estado", "recogida")
      .gte("menu.fecha", desdeISO)
      .lte("menu.fecha", hastaISO)
      .order("created_at", { ascending: true });
    const filas = [
      ["Fecha", "Código", "Nombre", "DNI", "Raciones"].join(","),
      ...(data ?? []).map((r: any) =>
        [
          r.menu?.fecha ?? "",
          r.codigo,
          `"${(r.nombre_comensal ?? "").replace(/"/g, '""')}"`,
          r.dni ?? "",
          r.cantidad,
        ].join(","),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([filas], { type: "text/csv;charset=utf-8" }));
    a.download = `entregas_${mesActivo.label}_${mesActivo.year}.csv`;
    a.click();
  };

  const eliminar = async (b: B) => {
    if (!confirm(`¿Quitar a ${b.nombre_completo} del padrón?`)) return;
    const { data: member } = await supabase
      .from("usuarios_comedor")
      .select("cargo")
      .eq("comedor_id", comedor!.id)
      .eq("dni", b.dni)
      .maybeSingle();
    if (!canRemoveBeneficiary(member?.cargo)) {
      alert(friendlyCreateBeneficiaryError("staff_in_padron"));
      return;
    }
    const { error } = await supabase.from("beneficiarios").delete().eq("id", b.id);
    if (error) {
      alert(friendlyCreateBeneficiaryError(error.message));
      return;
    }
    cargar();
  };

  if (loading || !comedor) return null;

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Padrón"
        subtitle={`${activos.length} personas registradas`}
        action={
          <PanelCta onClick={() => setEdicion({ open: true })} className="min-h-[52px] px-[22px] text-[16px] w-auto">
            <UserPlus size={22} strokeWidth={1.75} /> Beneficiario
          </PanelCta>
        }
      />

      <div className="flex flex-col gap-4">
        <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[16px] text-[#718096]">Tu padrón</span>
            <span className="text-[34px] font-bold tracking-[-0.02em] text-[#072249] leading-none">
              {activos.length} beneficiarios
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(["socia_familia", "publico_recurrente", "caso_social"] as const).map((k) => (
              <div key={k} className="bg-[#F0F0F0] rounded-xl p-3.5 flex flex-col gap-0.5">
                <span className="text-[15px] text-[#718096]">{CAT_LABEL[k]}</span>
                <span className="text-[20px] font-bold text-[#072249]">{porCat[k]}</span>
              </div>
            ))}
          </div>
        </section>

        {obs.length > 0 && (
          <div className="bg-[#FDF0D4] rounded-[20px] p-5 flex flex-col gap-2">
            <p className="font-bold flex items-center gap-2 text-[#8A5A00] text-[16px]">
              <AlertTriangle size={18} /> Observaciones ({obs.length})
            </p>
            {obs.slice(0, 5).map((o, i) => (
              <p key={i} className="text-[15px] text-[#8A5A00]">
                • {o}
              </p>
            ))}
          </div>
        )}

        <PanelWriteGate>
        <div className="flex gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setEdicion({ open: true })}
            className="flex-1 min-w-[200px] min-h-14 gap-2 inline-flex items-center justify-center rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
          >
            <UserPlus size={22} strokeWidth={1.75} /> Agregar beneficiario
          </button>
          <button
            type="button"
            onClick={() => setImportar(true)}
            className="min-h-14 px-5 gap-2 inline-flex items-center justify-center rounded-full bg-white border border-[#E0E0E0] text-[#475569] text-[17px] font-semibold whitespace-nowrap hover:border-[#0F7BA8]"
          >
            <Upload size={22} strokeWidth={1.75} /> Importar de Excel
          </button>
        </div>
        </PanelWriteGate>

        <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-3">
          <label className="text-[15px] font-semibold text-[#072249]">Buscar por DNI</label>
          <div className="flex gap-2.5">
            <input
              value={dniBusq}
              onChange={(e) => setDniBusq(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              maxLength={8}
              placeholder="Ingresa el DNI (8 dígitos)"
              className="flex-1 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] min-w-0"
            />
            <button
              type="button"
              aria-label="Buscar"
              className="size-14 shrink-0 grid place-items-center rounded-xl bg-[#0F7BA8] text-white hover:bg-[#0A5F82]"
            >
              <Search size={22} />
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-3">
          {filtrados.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-3.5 flex-wrap"
            >
              <div className="size-12 rounded-full bg-[#C5EBF9] text-[#072249] grid place-items-center text-[17px] font-bold shrink-0">
                {iniciales(b.nombre_completo)}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[19px] font-bold text-[#072249] truncate leading-tight">
                  {b.nombre_completo}
                </span>
                <span className="text-[16px] text-[#718096]">DNI {b.dni}</span>
              </div>
              {padronStaffCargo(cargoPorDni[b.dni]) && (
                <span className="text-[15px] font-bold px-3 py-[7px] rounded-md whitespace-nowrap bg-[#C5EBF9] text-[#072249]">
                  {CARGO_LABEL[cargoPorDni[b.dni]!]}
                </span>
              )}
              <span
                className={`text-[15px] font-bold px-3 py-[7px] rounded-md whitespace-nowrap ${chipCat(b.categoria)}`}
              >
                {CAT_CHIP[b.categoria]}
              </span>
              <PanelWriteGate>
              <button
                type="button"
                title="Editar"
                onClick={() => setEdicion({ open: true, b })}
                className="size-12 rounded-full bg-white border border-[#E0E0E0] text-[#475569] grid place-items-center shrink-0 hover:border-[#0F7BA8]"
              >
                <Pencil size={20} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                title="Eliminar"
                onClick={() => eliminar(b)}
                className="size-12 rounded-full bg-[#FDECEA] text-[#C5352B] grid place-items-center shrink-0 hover:bg-[#F9D8D4]"
              >
                <Trash2 size={20} strokeWidth={1.75} />
              </button>
              </PanelWriteGate>
            </div>
          ))}
          {filtrados.length === 0 && (
            <p className="text-center text-[17px] text-[#718096] py-6">Sin resultados.</p>
          )}
        </div>

        <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[19px] font-bold text-[#072249]">Registro de entregas</span>
            <span className="text-[17px] text-[#475569]">
              Cada persona en una fila y cada día del mes en una columna. Se marca solo cuando entregas un plato.
            </span>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {meses.map((m) => (
              <button
                key={m.offset}
                type="button"
                onClick={() => setMesOffset(m.offset)}
                className={chipMes(mesOffset === m.offset)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="bg-[#F0F0F0] rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[17px] text-[#475569]">{mesResumen}</span>
            <span className="text-[19px] font-bold text-[#072249]">
              {entregasMes.toLocaleString("es-PE")} platos
            </span>
          </div>
          <button
            type="button"
            onClick={exportarMes}
            className="min-h-14 gap-2 inline-flex items-center justify-center rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
          >
            <Download size={22} strokeWidth={1.75} /> Descargar Excel del mes
          </button>
        </section>
      </div>

      {edicion.open && canWrite && (
        <FormBenef
          comedorId={comedor.id}
          benef={edicion.b}
          cerrar={() => {
            setEdicion({ open: false });
            cargar();
          }}
        />
      )}

      {importar && canWrite && (
        <PanelOverlay onClose={() => setImportar(false)}>
          <div className="flex flex-col gap-1">
            <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Importar de Excel</h3>
            <p className="text-[17px] text-[#475569]">
              Sube un archivo con nombre, DNI, PIN y los datos que tengas.
            </p>
          </div>
          <ImportarPadron
            comedorId={comedor.id}
            alTerminar={() => {
              cargar();
            }}
          />
          <button
            type="button"
            onClick={() => setImportar(false)}
            className="min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold"
          >
            Cerrar
          </button>
        </PanelOverlay>
      )}
    </PanelShell>
  );
}

function FormBenef({
  comedorId,
  benef,
  cerrar,
}: {
  comedorId: string;
  benef?: B;
  cerrar: () => void;
}) {
  const [nombre, setNombre] = useState(benef?.nombre_completo ?? "");
  const [dni, setDni] = useState(benef?.dni ?? "");
  const [telefono, setTelefono] = useState(benef?.telefono ?? "");
  const [carga, setCarga] = useState(String(benef?.carga_familiar ?? 0));
  const [categoria, setCategoria] = useState<B["categoria"]>(benef?.categoria ?? "socia_familia");
  const [subtipo, setSubtipo] = useState<"adulto_mayor" | "madre_soltera" | "otro">(
    (benef?.subtipo_caso_social as any) ?? "adulto_mayor",
  );
  const [vigencia, setVigencia] = useState(benef?.vigencia_hasta ?? "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { pending, run } = useSubmitLock();
  const fnCrear = useServerFn(crearBeneficiario);

  const cats = [
    { key: "socia_familia" as const, label: "Socia" },
    { key: "publico_recurrente" as const, label: "Recurrente" },
    { key: "caso_social" as const, label: "Caso social" },
  ];

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (benef) {
        const data = validateUpdateBeneficiary({
          id: benef.id,
          nombre,
          dni,
          telefono,
          categoria,
          carga,
          subtipo,
          vigencia,
          comedor_id: comedorId,
        });
        void run(async () => {
          const { error } = await supabase.from("beneficiarios").update({
            nombre_completo: data.nombre,
            dni: data.dni,
            telefono: data.phone,
            carga_familiar: data.cargaFamiliar,
            categoria: data.categoria,
            subtipo_caso_social: data.socialSubtype,
            vigencia_hasta: data.validUntil,
          }).eq("id", data.id);
          if (error) {
            setErr(friendlyCreateBeneficiaryError(error.message));
            return;
          }
          cerrar();
        });
        return;
      }

      const data = validateCreateBeneficiary({
        nombre,
        dni,
        pin,
        telefono,
        categoria,
        carga,
        subtipo,
        vigencia,
        comedor_id: comedorId,
      });
      void run(async () => {
        try {
          const result = await fnCrear({
            data: {
              nombre: data.nombre,
              dni: data.dni,
              pin: data.pin,
              telefono: data.phone ?? "",
              categoria: data.categoria,
              carga: data.cargaFamiliar,
              subtipo: data.socialSubtype ?? "",
              vigencia: data.validUntil ?? "",
              comedor_id: data.comedor_id,
            },
          });
          if (result.note) alert(result.note);
          cerrar();
        } catch (e: any) {
          setErr(friendlyCreateBeneficiaryError(e?.message ?? ""));
        }
      });
    } catch (e: any) {
      setErr(e?.message ?? "Revisa los datos");
    }
  };

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">
          {benef ? "Editar beneficiario" : "Nuevo beneficiario"}
        </h3>
        <p className="text-[17px] text-[#475569]">
          {benef ? "Actualiza los datos del padrón." : "Entra con su DNI y el PIN que le des."}
        </p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label="DNI (8 dígitos)" note="Con el DNI encontramos su nombre completo.">
          <input
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
            required
            className={panelInputClass()}
            inputMode="numeric"
            placeholder="12345678"
            autoFocus={!benef}
          />
        </PanelField>
        <PanelField label="Nombre completo">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className={panelInputClass()}
            placeholder="Ej. María Quispe"
          />
        </PanelField>
        {!benef && (
          <PanelField label="PIN (4 a 8 números)" note="Lo usa para entrar a la plataforma.">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              required
              className={panelInputClass()}
              inputMode="numeric"
              placeholder="1234"
            />
          </PanelField>
        )}
        <PanelField label="Celular · opcional">
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className={panelInputClass()}
            inputMode="numeric"
            placeholder="987654321"
          />
        </PanelField>
        <PanelField label="Carga familiar">
          <input
            value={carga}
            onChange={(e) => setCarga(e.target.value.replace(/\D/g, "").slice(0, 2))}
            className={panelInputClass()}
            inputMode="numeric"
            placeholder="0"
          />
        </PanelField>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[#072249]">Categoría</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {cats.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategoria(c.key)}
                className={`min-h-14 px-3 rounded-xl text-[16px] font-semibold text-[#072249] border ${
                  categoria === c.key
                    ? "border-[#0F7BA8] bg-[#C5EBF9]"
                    : "border-[#E0E0E0] bg-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {categoria === "caso_social" && (
          <>
            <PanelField label="Subtipo">
              <select
                value={subtipo}
                onChange={(e) => setSubtipo(e.target.value as any)}
                className={panelInputClass()}
              >
                <option value="adulto_mayor">Adulto mayor</option>
                <option value="madre_soltera">Madre soltera</option>
                <option value="otro">Otro</option>
              </select>
            </PanelField>
            {subtipo !== "adulto_mayor" && (
              <PanelField label="Vigencia hasta">
                <input
                  type="date"
                  value={vigencia}
                  onChange={(e) => setVigencia(e.target.value)}
                  required
                  className={panelInputClass()}
                />
              </PanelField>
            )}
          </>
        )}
        {err && <p className="text-[15px] text-[#C5352B]">{err}</p>}
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={cerrar}
            className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold"
          >
            Cancelar
          </button>
          <PanelCta type="submit" loading={pending} className="flex-[1.4]">
            Guardar beneficiario
          </PanelCta>
        </div>
      </form>
    </PanelOverlay>
  );
}
