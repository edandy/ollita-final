import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelField, PanelCta, PanelOverlay, panelInputClass, PanelWriteGate,
} from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/cronograma")({
  head: () => ({ meta: [{ title: "Cronograma — La Ollita" }] }),
  component: CronogramaPage,
});

function startOfWeek(d = new Date()) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function etiquetaDia(d: Date) {
  const raw = d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric" });
  return raw.replace(/^\w/, (c) => c.toUpperCase());
}

function resumenTurno(registro: any | null) {
  if (!registro) return { texto: "Sin asignar", asignado: false };
  const dir = registro.directiva_de_turno?.trim();
  const cocinan = (registro.socias ?? []).filter(Boolean);
  if (!dir && cocinan.length === 0) return { texto: "Sin asignar", asignado: false };
  if (dir && cocinan.length) return { texto: `${dir} · cocinan ${cocinan.join(" y ")}`, asignado: true };
  if (dir) return { texto: dir, asignado: true };
  return { texto: `Cocinan ${cocinan.join(" y ")}`, asignado: true };
}

function CronogramaPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const [lunes, setLunes] = useState(startOfWeek());
  const [dias, setDias] = useState<any[]>([]);
  const [socias, setSocias] = useState<string[]>([]);
  const [editar, setEditar] = useState<string | null>(null);

  const cargar = async () => {
    if (!comedor) return;
    const fin = new Date(lunes);
    fin.setDate(fin.getDate() + 6);
    const { data } = await supabase
      .from("cronograma")
      .select("*")
      .eq("comedor_id", comedor.id)
      .gte("fecha", fmt(lunes))
      .lte("fecha", fmt(fin));
    const { data: us } = await supabase
      .from("usuarios_comedor")
      .select("nombre")
      .eq("comedor_id", comedor.id);
    setSocias((us ?? []).map((u: any) => u.nombre));
    const map = new Map((data ?? []).map((d: any) => [d.fecha, d]));
    const arr = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(lunes);
      d.setDate(d.getDate() + i);
      const f = fmt(d);
      return { fecha: f, dia: d, registro: map.get(f) ?? null };
    });
    setDias(arr);
  };
  useEffect(() => {
    cargar();
  }, [comedor?.id, lunes.getTime()]);

  const repetirSemana = async () => {
    if (!comedor) return;
    const prevLunes = new Date(lunes);
    prevLunes.setDate(prevLunes.getDate() - 7);
    const prevFin = new Date(prevLunes);
    prevFin.setDate(prevFin.getDate() + 6);
    const { data } = await supabase
      .from("cronograma")
      .select("*")
      .eq("comedor_id", comedor.id)
      .gte("fecha", fmt(prevLunes))
      .lte("fecha", fmt(prevFin));
    if (!data?.length) {
      void notifyError("No hay semana anterior para copiar.");
      return;
    }
    const inserts = data.map((d: any) => {
      const f = new Date(d.fecha + "T00:00:00");
      f.setDate(f.getDate() + 7);
      return {
        comedor_id: comedor.id,
        fecha: fmt(f),
        socias: d.socias,
        directiva_de_turno: d.directiva_de_turno,
        notas: d.notas,
      };
    });
    await supabase.from("cronograma").upsert(inserts, { onConflict: "comedor_id,fecha" });
    void notifySuccess("Se copió la semana anterior.");
    cargar();
  };

  if (loading || !comedor) return null;

  const subtitulo = `Semana del ${lunes.toLocaleDateString("es-PE", { day: "numeric", month: "long" })}`;

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Cronograma de turnos"
        subtitle={subtitulo}
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                const d = new Date(lunes);
                d.setDate(d.getDate() - 7);
                setLunes(d);
              }}
              className="size-12 rounded-full bg-white border border-[#E0E0E0] text-[#072249] grid place-items-center hover:border-[#0F7BA8]"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(lunes);
                d.setDate(d.getDate() + 7);
                setLunes(d);
              }}
              className="size-12 rounded-full bg-white border border-[#E0E0E0] text-[#072249] grid place-items-center hover:border-[#0F7BA8]"
              aria-label="Semana siguiente"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        <PanelWriteGate>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={repetirSemana}
            className="min-h-11 text-[16px] font-semibold text-[#0F7BA8] hover:text-[#0A5F82]"
          >
            Repetir semana anterior
          </button>
        </div>
        </PanelWriteGate>

        {dias.map((d) => {
          const quien = resumenTurno(d.registro);
          return (
            <div
              key={d.fecha}
              className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-3.5 flex-wrap"
            >
              <div className="flex-1 min-w-[160px] flex flex-col gap-0.5">
                <span className="text-[19px] font-bold text-[#072249] leading-tight">
                  {etiquetaDia(d.dia)}
                </span>
                <span
                  className={`text-[16px] ${quien.asignado ? "text-[#475569]" : "text-[#9197B3]"}`}
                >
                  {quien.texto}
                </span>
                {d.registro?.notas && (
                  <span className="text-[15px] text-[#0A5F82] mt-0.5">{d.registro.notas}</span>
                )}
              </div>
              <PanelWriteGate>
              <button
                type="button"
                onClick={() => setEditar(d.fecha)}
                className="min-h-12 px-5 rounded-full bg-white border border-[#E0E0E0] text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8] shrink-0"
              >
                Asignar turno
              </button>
              </PanelWriteGate>
            </div>
          );
        })}
      </div>

      {editar && canWrite && (
        <FormCrono
          comedorId={comedor.id}
          fecha={editar}
          etiqueta={etiquetaDia(dias.find((d) => d.fecha === editar)?.dia ?? new Date(editar + "T12:00:00"))}
          inicial={dias.find((d) => d.fecha === editar)?.registro}
          sociasDisponibles={socias}
          cerrar={() => {
            setEditar(null);
            cargar();
          }}
        />
      )}
    </PanelShell>
  );
}

function FormCrono({
  comedorId,
  fecha,
  etiqueta,
  inicial,
  sociasDisponibles,
  cerrar,
}: {
  comedorId: string;
  fecha: string;
  etiqueta: string;
  inicial: any;
  sociasDisponibles: string[];
  cerrar: () => void;
}) {
  const [seleccion, setSeleccion] = useState<string[]>(inicial?.socias ?? []);
  const [directiva, setDirectiva] = useState(inicial?.directiva_de_turno ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [manual, setManual] = useState("");
  const { pending, run } = useSubmitLock();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const extras = manual
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const sociasFinal = Array.from(new Set([...seleccion, ...extras]));
    void run(async () => {
      await supabase.from("cronograma").upsert(
        {
          comedor_id: comedorId,
          fecha,
          socias: sociasFinal,
          directiva_de_turno: directiva || null,
          notas: notas || null,
        },
        { onConflict: "comedor_id,fecha" },
      );
      void notifySuccess("Se guardó el turno.");
      cerrar();
    });
  };

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Asignar turno</h3>
        <p className="text-[17px] text-[#475569]">
          Quién cocina y quién está a cargo ese día. · {etiqueta}
        </p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label="Directiva de turno">
          <input
            value={directiva}
            onChange={(e) => setDirectiva(e.target.value)}
            className={panelInputClass()}
            placeholder="Ej. Doña Rosa"
            autoFocus
          />
        </PanelField>

        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[#072249]">Cocineras</span>
          {sociasDisponibles.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {sociasDisponibles.map((s) => {
                const a = seleccion.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setSeleccion(a ? seleccion.filter((x) => x !== s) : [...seleccion, s])
                    }
                    className={`min-h-14 px-3 rounded-xl text-[16px] font-semibold text-[#072249] border text-left ${
                      a ? "border-[#0F7BA8] bg-[#C5EBF9]" : "border-[#E0E0E0] bg-white"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className={panelInputClass()}
            placeholder="Ej. Elena, Rosa"
          />
          {sociasDisponibles.length === 0 && (
            <span className="text-[16px] text-[#718096]">
              Escribe los nombres separados por coma.
            </span>
          )}
        </div>

        <PanelField label="Notas · opcional">
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={panelInputClass()}
            placeholder="Reemplazos, observaciones…"
          />
        </PanelField>

        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={cerrar}
            className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold hover:border-[#9197B3]"
          >
            Cancelar
          </button>
          <PanelCta type="submit" loading={pending} className="flex-[1.4]">
            Guardar turno
          </PanelCta>
        </div>
      </form>
    </PanelOverlay>
  );
}
