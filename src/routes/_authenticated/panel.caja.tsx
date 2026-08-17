import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { subirFoto } from "@/lib/subirFoto";
import { Plus, Minus, Printer, Lock, Unlock, Camera, ImagePlus, X } from "lucide-react";
import { PanelShell, PanelTitle, PanelWriteGate } from "@/components/panel-ui";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/panel/caja")({
  head: () => ({ meta: [{ title: "Caja — La Ollita" }] }),
  component: CajaPage,
});

type Caja = {
  id: string;
  fecha: string;
  capital_inicial: number;
  total_ingresos: number;
  total_egresos: number;
  ganancia: number;
  cerrado: boolean;
};
type Trx = {
  id: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  monto: number;
  nota: string | null;
  created_at: string;
  comprobante_url: string | null;
};

const LABEL: Record<string, string> = {
  venta_menus: "Venta de platos",
  actividad: "Donación",
  otro: "Otro",
  compra_frescos: "Compra de frescos",
  compra_insumos: "Compra de insumos",
  gas: "Gas",
  agua: "Agua",
  luz: "Luz",
};

const ING_OPTS = [
  { key: "venta", label: "Venta de platos", categoria: "venta_menus" },
  { key: "donacion", label: "Donación", categoria: "actividad" },
  { key: "aporte", label: "Aporte de socias", categoria: "otro" },
  { key: "otro", label: "Otro ingreso", categoria: "otro" },
] as const;

const EGR_OPTS = [
  { key: "frescos", label: "Compra de frescos", categoria: "compra_frescos" },
  { key: "gas", label: "Gas", categoria: "gas" },
  { key: "transporte", label: "Transporte", categoria: "otro" },
  { key: "otro", label: "Otro gasto", categoria: "otro" },
] as const;

function CajaPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const [caja, setCaja] = useState<Caja | null>(null);
  const [trx, setTrx] = useState<Trx[]>([]);
  const [mes, setMes] = useState<Caja[]>([]);
  const { pending: abriendo, run: runAbrir } = useSubmitLock();
  const [capitalInicial, setCapitalInicial] = useState("0");
  const [formTrx, setFormTrx] = useState<"ingreso" | "egreso" | null>(null);

  const cargar = async () => {
    if (!comedor) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const inicioMes = hoy.slice(0, 7) + "-01";
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("caja_dias").select("*").eq("comedor_id", comedor.id).eq("fecha", hoy).maybeSingle(),
      supabase.from("caja_dias").select("*").eq("comedor_id", comedor.id).gte("fecha", inicioMes).order("fecha", { ascending: false }),
    ]);
    setCaja(c as Caja | null);
    setMes((m as Caja[]) ?? []);
    if (c) {
      const { data: t } = await supabase
        .from("transacciones")
        .select("*")
        .eq("caja_dia_id", (c as any).id)
        .order("created_at", { ascending: false });
      setTrx((t as Trx[]) ?? []);
    } else {
      setTrx([]);
    }
    if (!c) {
      const ayer = (m as Caja[])?.[0];
      setCapitalInicial(String(ayer?.capital_inicial ?? 0));
    }
  };
  useEffect(() => {
    cargar();
  }, [comedor?.id]);

  const abrir = () => {
    if (!comedor) return;
    void runAbrir(async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("caja_dias")
        .insert({ comedor_id: comedor.id, fecha: hoy, capital_inicial: Number(capitalInicial) });
      if (error) {
        void notifyError(friendlySupabaseError(error.message));
        return;
      }
      void notifySuccess("Se abrió la caja del día.");
      await cargar();
    });
  };

  const cerrar = async () => {
    if (!caja) return;
    const ing = trx.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
    const egr = trx.filter((t) => t.tipo === "egreso").reduce((s, t) => s + Number(t.monto), 0);
    const ganancia = ing - egr;
    await supabase
      .from("caja_dias")
      .update({ total_ingresos: ing, total_egresos: egr, ganancia, cerrado: true })
      .eq("id", caja.id);
    void notifySuccess("Se cerró la caja del día.");
    cargar();
  };

  const acumuladoMes = useMemo(() => mes.reduce((s, d) => s + Number(d.ganancia ?? 0), 0), [mes]);
  const ingresosHoy = trx.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const egresosHoy = trx.filter((t) => t.tipo === "egreso").reduce((s, t) => s + Number(t.monto), 0);
  const enCaja = caja ? Number(caja.capital_inicial) + ingresosHoy - egresosHoy : 0;
  const fechaHoy = new Date()
    .toLocaleDateString("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .replace(/^\w/, (c) => c.toUpperCase());

  if (loading || !comedor) return null;

  return (
    <PanelShell>
      <PanelTitle title="Caja de hoy" subtitle={fechaHoy} />

      <div className="flex flex-col gap-4">
        {!caja ? (
          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4">
            <p className="text-[17px] text-[#475569]">
              {canWrite ? "Aún no abres la caja de hoy." : "La caja de hoy aún no está abierta."}
            </p>
            <PanelWriteGate>
              <label className="flex flex-col gap-2">
                <span className="text-[15px] font-semibold text-[#072249]">Capital inicial (S/)</span>
                <input
                  type="number"
                  step="0.10"
                  value={capitalInicial}
                  onChange={(e) => setCapitalInicial(e.target.value)}
                  className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]"
                />
              </label>
              <button
                type="button"
                onClick={abrir}
                disabled={abriendo}
                className="min-h-[58px] rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
              >
                {abriendo ? "Abriendo…" : "Abrir caja"}
              </button>
            </PanelWriteGate>
          </section>
        ) : (
          <>
            <section className="bg-[#072249] rounded-[20px] p-6 flex flex-col gap-[18px] text-white">
              <div className="flex flex-col gap-0.5">
                <span className="text-[16px] text-[#A2D9F2]">Dinero en caja</span>
                <span className="text-[40px] font-bold tracking-[-0.02em] leading-none">
                  S/ {enCaja.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[rgba(162,217,242,0.16)] rounded-[14px] p-3.5 flex flex-col gap-0.5">
                  <span className="text-[15px] text-[#A2D9F2]">Ingresos de hoy</span>
                  <span className="text-[22px] font-bold">S/ {ingresosHoy.toFixed(2)}</span>
                </div>
                <div className="bg-[rgba(162,217,242,0.16)] rounded-[14px] p-3.5 flex flex-col gap-0.5">
                  <span className="text-[15px] text-[#A2D9F2]">Egresos de hoy</span>
                  <span className="text-[22px] font-bold">S/ {egresosHoy.toFixed(2)}</span>
                </div>
              </div>
            </section>

            {!caja.cerrado ? (
              <PanelWriteGate>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormTrx("ingreso")}
                    className="min-h-[60px] gap-2 flex items-center justify-center rounded-full bg-[#0F7BA8] text-white text-[18px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
                  >
                    <Plus size={24} strokeWidth={2} /> Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTrx("egreso")}
                    className="min-h-[60px] gap-2 flex items-center justify-center rounded-full border border-[#0F7BA8] bg-white text-[#0F7BA8] text-[18px] font-semibold hover:bg-[#C5EBF9]"
                  >
                    <Minus size={24} strokeWidth={2} /> Egreso
                  </button>
                </div>
              </PanelWriteGate>
            ) : (
              <CajaCerrada caja={caja} onReabrir={cargar} />
            )}

            <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4">
              <span className="text-[19px] font-bold text-[#072249]">Movimientos de hoy</span>
              {trx.length === 0 && (
                <p className="text-[16px] text-[#718096]">Aún no hay movimientos.</p>
              )}
              {trx.map((t) => {
                const hora = new Date(t.created_at).toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const esIng = t.tipo === "ingreso";
                return (
                  <div key={t.id} className="flex items-center gap-3.5">
                    <div
                      className={`size-10 rounded-full grid place-items-center shrink-0 ${
                        esIng
                          ? "bg-[rgba(52,168,83,0.14)] text-[#248341]"
                          : "bg-[#FDF0D4] text-[#8A5A00]"
                      }`}
                    >
                      {esIng ? <Plus size={20} strokeWidth={2} /> : <Minus size={20} strokeWidth={2} />}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-px">
                      <span className="text-[17px] font-semibold text-[#072249] truncate leading-tight">
                        {LABEL[t.categoria] ?? t.categoria}
                        {t.nota ? ` · ${t.nota}` : ""}
                      </span>
                      <span className="text-[15px] text-[#718096] truncate">{hora}</span>
                    </div>
                    <span
                      className={`text-[17px] font-bold shrink-0 ${
                        esIng ? "text-[#248341]" : "text-[#8A5A00]"
                      }`}
                    >
                      {esIng ? "+" : "−"} S/ {Number(t.monto).toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <PanelWriteGate>
                {!caja.cerrado && trx.length > 0 && (
                  <button
                    type="button"
                    onClick={cerrar}
                    className="min-h-14 rounded-full bg-[#072249] text-white text-[17px] font-semibold hover:bg-[#0A2E5E] mt-1"
                  >
                    Cerrar día
                  </button>
                )}
              </PanelWriteGate>
            </section>
          </>
        )}

        <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[19px] font-bold text-[#072249]">Este mes</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-12 px-4 gap-2 inline-flex items-center rounded-full border border-[#E0E0E0] bg-white text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8]"
            >
              <Printer size={22} strokeWidth={1.75} /> Imprimir
            </button>
          </div>
          {mes.length === 0 && (
            <p className="text-[16px] text-[#718096]">Sin registros este mes.</p>
          )}
          {mes.map((d) => (
            <div key={d.id} className="flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[120px] text-[17px] text-[#475569]">
                {new Date(d.fecha + "T00:00:00").toLocaleDateString("es-PE", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span className="text-[16px] text-[#248341]">+ S/ {Number(d.total_ingresos).toFixed(2)}</span>
              <span className="text-[16px] text-[#8A5A00]">− S/ {Number(d.total_egresos).toFixed(2)}</span>
              <span className="text-[17px] font-bold text-[#072249] min-w-[88px] text-right">
                S/ {Number(d.ganancia).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-[#F0F0F0] pt-4 flex items-center justify-between gap-3">
            <span className="text-[17px] font-semibold text-[#072249]">
              Ganancia disponible para compras
            </span>
            <span className="text-[22px] font-bold text-[#0F7BA8]">S/ {acumuladoMes.toFixed(2)}</span>
          </div>
        </section>
      </div>

      {formTrx && caja && canWrite && (
        <FormTrx
          tipo={formTrx}
          cajaId={caja.id}
          comedorId={comedor.id}
          cerrar={() => {
            setFormTrx(null);
            cargar();
          }}
        />
      )}
    </PanelShell>
  );
}

function CajaCerrada({ caja, onReabrir }: { caja: Caja; onReabrir: () => void }) {
  const [progreso, setProgreso] = useState(0);
  const t = useRef<number | null>(null);
  const inicio = useRef(0);
  const detener = () => {
    if (t.current) {
      cancelAnimationFrame(t.current);
      t.current = null;
    }
    setProgreso(0);
  };
  const empezar = (e: React.PointerEvent) => {
    e.preventDefault();
    inicio.current = Date.now();
    const tick = async () => {
      const p = Math.min(1, (Date.now() - inicio.current) / 1500);
      setProgreso(p);
      if (p >= 1) {
        t.current = null;
        const { error } = await supabase.from("caja_dias").update({ cerrado: false }).eq("id", caja.id);
        if (error) void notifyError(friendlySupabaseError(error.message));
        else {
          void notifySuccess("Se reabrió la caja.");
          onReabrir();
        }
        return;
      }
      t.current = requestAnimationFrame(tick);
    };
    t.current = requestAnimationFrame(tick);
  };
  return (
    <div className="bg-[#C5EBF9] text-[#072249] rounded-[20px] p-5 text-center flex flex-col gap-3">
      <p className="font-bold text-[17px] flex items-center gap-1.5 justify-center">
        <Lock size={18} /> Caja cerrada
      </p>
      <p className="text-[16px]">
        Ganancia del día: <strong>S/ {Number(caja.ganancia).toFixed(2)}</strong>
      </p>
      <PanelWriteGate>
        <button
          type="button"
          onPointerDown={empezar}
          onPointerUp={detener}
          onPointerLeave={detener}
          onPointerCancel={detener}
          className="relative w-full overflow-hidden bg-white border border-[#E0E0E0] rounded-full min-h-14 text-[#072249] font-semibold text-[16px] flex items-center justify-center gap-2 select-none"
        >
          <span
            className="absolute inset-0 bg-[rgba(15,123,168,0.15)] origin-left"
            style={{ transform: `scaleX(${progreso})`, transition: progreso === 0 ? "transform .2s" : "none" }}
          />
          <Unlock size={18} className="relative" />
          <span className="relative">
            {progreso > 0 ? "Mantén presionado…" : "Mantén presionado para reabrir"}
          </span>
        </button>
      </PanelWriteGate>
    </div>
  );
}

function FormTrx({
  tipo,
  cajaId,
  comedorId,
  cerrar,
}: {
  tipo: "ingreso" | "egreso";
  cajaId: string;
  comedorId: string;
  cerrar: () => void;
}) {
  const opts = tipo === "ingreso" ? ING_OPTS : EGR_OPTS;
  const [optKey, setOptKey] = useState<string>(opts[0].key);
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const { pending, run } = useSubmitLock();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const opt = opts.find((o) => o.key === optKey) ?? opts[0];

  const titulo =
    tipo === "egreso"
      ? "Registrar egreso"
      : (
          {
            venta: "Registrar venta",
            donacion: "Registrar donación",
            aporte: "Registrar aporte",
            otro: "Registrar ingreso",
          } as Record<string, string>
        )[optKey] ?? "Registrar ingreso";

  const notaLabel =
    tipo === "egreso"
      ? "Nota · opcional"
      : optKey === "donacion"
        ? "¿Quién donó?"
        : optKey === "aporte"
          ? "¿Qué socia aportó?"
          : "Nota · opcional";

  const notaPh =
    tipo === "egreso"
      ? "Ej. mercado de Caquetá"
      : optKey === "donacion"
        ? "Ej. Municipalidad, vecino"
        : optKey === "aporte"
          ? "Ej. María Quispe"
          : "Ej. venta del mostrador";

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      setComprobante(await subirFoto(file, `comedor/${comedorId}/comprobantes`));
    } catch (err: any) {
      void notifyError(friendlySupabaseError(err?.message ?? "No se pudo subir la foto"));
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.from("transacciones").insert({
        caja_dia_id: cajaId,
        tipo,
        categoria: opt.categoria as any,
        monto: Number(monto),
        nota: nota || null,
        comprobante_url: comprobante,
      });
      if (error) {
        void notifyError(friendlySupabaseError(error.message));
        return;
      }
      void notifySuccess("Se guardó el movimiento.");
      cerrar();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(7,34,73,0.55)] flex items-end sm:items-center justify-center p-6"
      onClick={cerrar}
    >
      <div
        className="w-full max-w-[520px] max-h-[100%] overflow-y-auto bg-white rounded-[22px] p-[26px] flex flex-col gap-[18px] shadow-[0_12px_40px_rgba(7,34,73,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">{titulo}</h3>
          <p className="text-[17px] text-[#475569]">
            {tipo === "ingreso" ? "Queda en el movimiento del día." : "Sale de la caja del día."}
          </p>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">
              {tipo === "ingreso" ? "¿De dónde viene el dinero?" : "En qué gastaste"}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {opts.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOptKey(o.key)}
                  className={`min-h-14 px-3 rounded-xl text-[16px] font-semibold text-[#072249] border ${
                    optKey === o.key
                      ? "border-[#0F7BA8] bg-[#C5EBF9]"
                      : "border-[#E0E0E0] bg-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {tipo === "ingreso" && optKey === "venta" && (
              <span className="text-[16px] text-[#718096]">
                Las reservas ya entran solas al marcarlas como entregadas.
              </span>
            )}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">Monto (S/)</span>
            <input
              type="number"
              step="0.10"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
              placeholder="0.00"
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">{notaLabel}</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={notaPh}
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">
              Comprobante <span className="font-normal text-[#718096]">· opcional</span>
            </span>
            <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            <input ref={galRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            {comprobante ? (
              <div className="relative w-28">
                <img
                  src={comprobante}
                  alt="Comprobante"
                  className="w-28 h-28 rounded-xl object-cover border border-[#E0E0E0]"
                />
                <button
                  type="button"
                  onClick={() => setComprobante(null)}
                  className="absolute -top-2 -right-2 bg-white border border-[#E0E0E0] rounded-full p-1 shadow"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => camRef.current?.click()}
                  disabled={subiendo}
                  className="flex-1 min-h-14 gap-2 inline-flex items-center justify-center border border-dashed border-[#A2D9F2] rounded-xl bg-[#FCFCFC] text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8] disabled:opacity-60"
                >
                  <Camera size={22} strokeWidth={1.75} /> Tomar foto
                </button>
                <button
                  type="button"
                  onClick={() => galRef.current?.click()}
                  disabled={subiendo}
                  className="flex-1 min-h-14 gap-2 inline-flex items-center justify-center border border-dashed border-[#A2D9F2] rounded-xl bg-[#FCFCFC] text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8] disabled:opacity-60"
                >
                  <ImagePlus size={22} strokeWidth={1.75} /> Subir foto
                </button>
              </div>
            )}
            {subiendo && <p className="text-[15px] text-[#718096]">Subiendo foto…</p>}
          </div>

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={cerrar}
              className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold hover:border-[#9197B3]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={subiendo || pending}
              className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
            >
              {pending ? "Guardando…" : tipo === "ingreso" ? "Guardar ingreso" : "Guardar egreso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
