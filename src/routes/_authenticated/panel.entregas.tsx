import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Banknote, CheckCircle2, Smartphone, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useCanWrite, PanelWriteGate, PanelShell } from "@/components/panel-ui";
import { useSubmitLock } from "@/lib/submit-lock";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";
import { generateReservationCode, retryOnUniqueViolation } from "@/lib/reservas";
import { ensureComedorCode } from "@/lib/reservas.functions";
import { todayISO } from "@/lib/dates";
import {
  DELIVERY_SERVING_CAP,
  deliveryAmount,
  deliveryBlockReason,
  ENTREGAS_MSG,
  maxServings,
  shouldOpenDebt,
  shouldPostCajaIncome,
  walkInNameOk,
  type DeliveryPayMethod,
} from "@/lib/entregas";

export const Route = createFileRoute("/_authenticated/panel/entregas")({
  head: () => ({ meta: [{ title: "Entregas — La Ollita" }] }),
  component: EntregasPage,
});

type PadronPerson = {
  id: string;
  nombre_completo: string;
  dni: string;
  foto_url: string | null;
};

type OpenDebt = {
  id: string;
  person_name: string;
  dni: string | null;
  amount: number;
  servings: number;
  beneficiario_id: string | null;
};

type MenuHoy = {
  id: string;
  raciones_disponibles: number;
  nombre_plato: string;
};

type ModalStep = "persona" | "nombre" | "raciones" | "pago" | "listo";

function soles(n: number) {
  return `S/ ${Number(n).toFixed(2)}`;
}

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[1]![0]!).toUpperCase();
}

function PersonFace({ name, foto }: { name: string; foto?: string | null }) {
  if (foto) {
    return <img src={foto} alt="" className="size-16 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="size-16 rounded-full bg-[#C5EBF9] text-[#072249] grid place-items-center text-[18px] font-bold shrink-0">
      {iniciales(name)}
    </div>
  );
}

async function ensureTodayCaja(comedorId: string) {
  const hoy = todayISO();
  const { data: existing, error: readErr } = await supabase
    .from("caja_dias")
    .select("id, cerrado")
    .eq("comedor_id", comedorId)
    .eq("fecha", hoy)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) {
    if (existing.cerrado) {
      const { error } = await supabase.from("caja_dias").update({ cerrado: false }).eq("id", existing.id);
      if (error) throw error;
    }
    return { id: existing.id, created: false };
  }
  const { data: created, error } = await supabase
    .from("caja_dias")
    .insert({ comedor_id: comedorId, fecha: hoy, capital_inicial: 0 })
    .select("id")
    .single();
  if (!error && created) return { id: created.id, created: true };
  const { data: raced } = await supabase
    .from("caja_dias")
    .select("id")
    .eq("comedor_id", comedorId)
    .eq("fecha", hoy)
    .maybeSingle();
  if (raced) return { id: raced.id, created: false };
  throw error ?? new Error("No pudimos abrir la caja de hoy.");
}

function EntregasPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const fnEnsureCode = useServerFn(ensureComedorCode);
  const { pending: entregando, run: runEntregar } = useSubmitLock();
  const { pending: cobrando, run: runCobrar } = useSubmitLock();

  const [menu, setMenu] = useState<MenuHoy | null>(null);
  const [padron, setPadron] = useState<PadronPerson[]>([]);
  const [deudas, setDeudas] = useState<OpenDebt[]>([]);
  const [acumulado, setAcumulado] = useState(0);
  const [hoySoles, setHoySoles] = useState(0);
  const [racionesHoy, setRacionesHoy] = useState(0);

  const [modal, setModal] = useState(false);
  const [paso, setPaso] = useState<ModalStep>("persona");
  const [persona, setPersona] = useState<PadronPerson | null>(null);
  const [walkIn, setWalkIn] = useState("");
  const [servings, setServings] = useState(1);
  const [cobrarId, setCobrarId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!comedor) return;
    const hoy = todayISO();
    const [{ data: m }, { data: ben }, { data: debts }, { data: dias }] = await Promise.all([
      supabase.from("menus").select("id, raciones_disponibles, nombre_plato").eq("comedor_id", comedor.id).eq("fecha", hoy).maybeSingle(),
      supabase.from("beneficiarios").select("id, nombre_completo, dni, foto_url").eq("comedor_id", comedor.id).eq("activo", true).order("nombre_completo"),
      supabase.from("debts").select("id, person_name, dni, amount, servings, beneficiario_id").eq("comedor_id", comedor.id).eq("status", "open").order("created_at"),
      supabase.from("caja_dias").select("id, fecha").eq("comedor_id", comedor.id),
    ]);
    setMenu(m as MenuHoy | null);
    setPadron((ben ?? []) as PadronPerson[]);
    setDeudas((debts ?? []) as OpenDebt[]);

    const cajaIds = (dias ?? []).map((d) => d.id);
    const cajaHoy = (dias ?? []).find((d) => d.fecha === hoy);
    if (cajaIds.length === 0) {
      setAcumulado(0);
      setHoySoles(0);
    } else {
      const { data: trx } = await supabase
        .from("transacciones")
        .select("monto, caja_dia_id")
        .in("caja_dia_id", cajaIds)
        .eq("categoria", "venta_menus")
        .eq("tipo", "ingreso");
      const rows = trx ?? [];
      setAcumulado(rows.reduce((s, t) => s + Number(t.monto), 0));
      setHoySoles(cajaHoy ? rows.filter((t) => t.caja_dia_id === cajaHoy.id).reduce((s, t) => s + Number(t.monto), 0) : 0);
    }

    if (m) {
      const { data: reservas } = await supabase.from("reservas").select("cantidad, estado").eq("menu_id", m.id).eq("estado", "recogida");
      setRacionesHoy((reservas ?? []).reduce((s, r) => s + Number(r.cantidad), 0));
    } else {
      setRacionesHoy(0);
    }
  }, [comedor?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tope = useMemo(
    () =>
      maxServings({
        available: menu?.raciones_disponibles ?? 0,
        cap: DELIVERY_SERVING_CAP,
        kitchenMax: comedor?.max_raciones_por_reserva,
      }),
    [menu?.raciones_disponibles, comedor?.max_raciones_por_reserva],
  );

  const bloqueo = deliveryBlockReason({ hasMenu: !!menu, available: menu?.raciones_disponibles ?? 0 });
  const precio = Number(comedor?.precio_menu ?? 0);
  const total = deliveryAmount(precio, servings);
  const nombreElegido = persona?.nombre_completo ?? walkIn.trim();

  const abrirModal = () => {
    if (!canWrite || bloqueo) return;
    setPersona(null);
    setWalkIn("");
    setServings(Math.min(1, tope) || 1);
    setPaso("persona");
    setModal(true);
  };

  const cerrarModal = () => {
    if (entregando) return;
    setModal(false);
  };

  const elegirPersona = (p: PadronPerson) => {
    setPersona(p);
    setWalkIn("");
    setServings(Math.min(1, tope) || 1);
    setPaso("raciones");
  };

  const irVentaLibre = () => {
    setPersona(null);
    setWalkIn("");
    setPaso("nombre");
  };

  const seguirConNombre = () => {
    if (!walkInNameOk(walkIn)) {
      void notifyError(ENTREGAS_MSG.needName);
      return;
    }
    setServings(Math.min(1, tope) || 1);
    setPaso("raciones");
  };

  const guardarEntrega = (method: DeliveryPayMethod) => {
    if (!canWrite || !comedor || !menu) return;
    if (tope < 1) {
      void notifyError(ENTREGAS_MSG.noServings);
      return;
    }
    const cant = Math.min(servings, tope);
    if (cant < 1) return;
    const enrolled = !!persona;
    const nombre = enrolled ? persona.nombre_completo : walkIn.trim();
    if (!enrolled && !walkInNameOk(nombre)) {
      void notifyError(ENTREGAS_MSG.needName);
      return;
    }
    const monto = deliveryAmount(precio, cant);

    void runEntregar(async () => {
      let kitchenCode = "";
      try {
        const ensured = await fnEnsureCode({ data: { comedor_id: comedor.id } });
        kitchenCode = ensured.code;
      } catch (e: any) {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos generar el código."));
        return;
      }

      let codigo = "";
      let reservaId: string | null = null;
      const { data: reserva, error } = await retryOnUniqueViolation(async () => {
        codigo = generateReservationCode({ kitchenCode, enrolled });
        return supabase
          .from("reservas")
          .insert({
            menu_id: menu.id,
            comedor_id: comedor.id,
            codigo,
            nombre_comensal: nombre || null,
            telefono: null,
            cantidad: cant,
            estado: "recogida",
            dni: persona?.dni ?? null,
            beneficiario_id: persona?.id ?? null,
          } as any)
          .select("id")
          .single();
      });
      if (error) {
        void notifyError(friendlySupabaseError(error.message));
        return;
      }
      reservaId = reserva?.id ?? null;

      if (shouldPostCajaIncome(method)) {
        try {
          const caja = await ensureTodayCaja(comedor.id);
          const { error: trxErr } = await supabase.from("transacciones").insert({
            caja_dia_id: caja.id,
            tipo: "ingreso",
            categoria: "venta_menus",
            monto,
            payment_method: method,
            nota: `Entrega ${codigo} · ${nombre} · ${cant} ración(es)`,
          });
          if (trxErr) {
            void notifyError(friendlySupabaseError(trxErr.message));
            return;
          }
        } catch (e: any) {
          void notifyError(friendlySupabaseError(e?.message ?? "No pudimos registrar el pago en caja."));
          return;
        }
      }

      if (shouldOpenDebt(method)) {
        const { error: debtErr } = await supabase.from("debts").insert({
          comedor_id: comedor.id,
          beneficiario_id: persona?.id ?? null,
          person_name: nombre,
          dni: persona?.dni ?? null,
          reservation_id: reservaId,
          servings: cant,
          amount: monto,
          status: "open",
        });
        if (debtErr) {
          void notifyError(friendlySupabaseError(debtErr.message));
          return;
        }
      }

      void notifySuccess(ENTREGAS_MSG.deliveryOk);
      setPaso("listo");
      await cargar();
    });
  };

  const marcarPagado = (debt: OpenDebt, method: "efectivo" | "yape") => {
    if (!canWrite || !comedor) return;
    void runCobrar(async () => {
      try {
        const caja = await ensureTodayCaja(comedor.id);
        const { data: trx, error: trxErr } = await supabase
          .from("transacciones")
          .insert({
            caja_dia_id: caja.id,
            tipo: "ingreso",
            categoria: "venta_menus",
            monto: Number(debt.amount),
            payment_method: method,
            nota: `Cobro deuda · ${debt.person_name}`,
          })
          .select("id")
          .single();
        if (trxErr) {
          void notifyError(friendlySupabaseError(trxErr.message));
          return;
        }
        const { error: upErr } = await supabase
          .from("debts")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            paid_transaction_id: trx?.id ?? null,
          })
          .eq("id", debt.id);
        if (upErr) {
          void notifyError(friendlySupabaseError(upErr.message));
          return;
        }
        void notifySuccess(ENTREGAS_MSG.debtPaid);
        setCobrarId(null);
        await cargar();
      } catch (e: any) {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos registrar el cobro."));
      }
    });
  };

  if (loading || !comedor) return null;

  const atrasPaso = () => {
    if (entregando) return;
    if (paso === "nombre") setPaso("persona");
    else if (paso === "raciones") setPaso(persona ? "persona" : "nombre");
    else if (paso === "pago") setPaso("raciones");
  };

  return (
    <PanelShell>
      <section className="bg-[#072249] rounded-[20px] p-6 flex flex-col gap-[18px] text-white">
        <div className="flex flex-col gap-0.5">
          <span className="text-[16px] text-[#A2D9F2]">Acumulado de entregas</span>
          <span className="text-[40px] font-bold tracking-[-0.02em] leading-none">{soles(acumulado)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[rgba(162,217,242,0.16)] rounded-[14px] p-3.5 flex flex-col gap-0.5">
            <span className="text-[15px] text-[#A2D9F2]">Hoy S/</span>
            <span className="text-[22px] font-bold">{soles(hoySoles)}</span>
          </div>
          <div className="bg-[rgba(162,217,242,0.16)] rounded-[14px] p-3.5 flex flex-col gap-0.5">
            <span className="text-[15px] text-[#A2D9F2]">Raciones de hoy</span>
            <span className="text-[22px] font-bold">{racionesHoy}</span>
          </div>
        </div>
      </section>

      {bloqueo ? (
        <p className="text-[18px] font-semibold text-[#072249] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
          {bloqueo}
        </p>
      ) : (
        <PanelWriteGate>
          <button
            type="button"
            onClick={abrirModal}
            className="min-h-[88px] w-full rounded-[20px] bg-[#0F7BA8] text-white text-[26px] font-bold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
          >
            Entregar
          </button>
        </PanelWriteGate>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-[22px] font-bold text-bosque">Por cobrar</h3>
        {deudas.length === 0 ? (
          <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-4">Nadie debe.</p>
        ) : (
          deudas.map((d) => {
            const foto = padron.find((p) => p.id === d.beneficiario_id)?.foto_url;
            const cobrandoEsta = cobrarId === d.id;
            return (
              <div key={d.id} className="bg-white border border-[#E0E0E0] rounded-[18px] px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <PersonFace name={d.person_name} foto={foto} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[20px] font-bold text-[#072249] truncate leading-tight">{d.person_name}</p>
                    <p className="text-[17px] text-[#718096]">{soles(Number(d.amount))}</p>
                  </div>
                </div>
                <PanelWriteGate>
                  {cobrandoEsta ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={cobrando}
                        onClick={() => marcarPagado(d, "efectivo")}
                        className="min-h-[72px] rounded-[16px] bg-[#0F7BA8] text-white text-[18px] font-bold disabled:opacity-60"
                      >
                        {cobrando ? "Guardando…" : "Efectivo"}
                      </button>
                      <button
                        type="button"
                        disabled={cobrando}
                        onClick={() => marcarPagado(d, "yape")}
                        className="min-h-[72px] rounded-[16px] bg-[#072249] text-white text-[18px] font-bold disabled:opacity-60"
                      >
                        {cobrando ? "Guardando…" : "Yape"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCobrarId(d.id)}
                      className="min-h-[72px] w-full rounded-[16px] bg-white border-2 border-[#0F7BA8] text-[#0F7BA8] text-[20px] font-bold"
                    >
                      Ya pagó
                    </button>
                  )}
                </PanelWriteGate>
              </div>
            );
          })
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 bg-[#F0F0F0] flex flex-col">
          <div className="max-w-[780px] w-full mx-auto flex-1 min-h-0 flex flex-col px-5 pt-4 pb-6 gap-4">
            {paso !== "listo" && (
              <button
                type="button"
                onClick={paso === "persona" ? cerrarModal : atrasPaso}
                className="self-start min-h-14 px-4 pl-2 gap-1.5 inline-flex items-center rounded-full text-[#0F7BA8] text-[18px] font-semibold"
              >
                <ArrowLeft size={24} /> {paso === "persona" ? "Cerrar" : "Atrás"}
              </button>
            )}

            {paso === "persona" && (
              <>
                <h2 className="text-[26px] font-bold text-bosque leading-tight">¿A quién le das?</h2>
                <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 content-start">
                  {padron.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => elegirPersona(p)}
                      className="min-h-[120px] bg-white border border-[#E0E0E0] rounded-[18px] p-3 flex flex-col items-center justify-center gap-2 text-center"
                    >
                      <PersonFace name={p.nombre_completo} foto={p.foto_url} />
                      <span className="text-[16px] font-bold text-[#072249] leading-tight line-clamp-2">{p.nombre_completo}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={irVentaLibre}
                  className="min-h-[72px] w-full rounded-[16px] bg-white border-2 border-[#072249] text-[#072249] text-[20px] font-bold inline-flex items-center justify-center gap-2"
                >
                  <UserPlus size={24} /> Venta a no empadronado
                </button>
              </>
            )}

            {paso === "nombre" && (
              <>
                <h2 className="text-[26px] font-bold text-bosque leading-tight">Nombre de la persona</h2>
                <input
                  autoFocus
                  value={walkIn}
                  onChange={(e) => setWalkIn(e.target.value)}
                  placeholder="Ej. Rosa Huamán"
                  className="min-h-[72px] w-full border-2 border-[#E0E0E0] rounded-[16px] px-4 text-[22px] bg-white outline-none focus:border-[#0F7BA8]"
                />
                <button
                  type="button"
                  onClick={seguirConNombre}
                  className="min-h-[72px] w-full rounded-[16px] bg-[#0F7BA8] text-white text-[22px] font-bold"
                >
                  Continuar
                </button>
              </>
            )}

            {paso === "raciones" && (
              <>
                <h2 className="text-[26px] font-bold text-bosque leading-tight">¿Cuántas raciones?</h2>
                <p className="text-[18px] text-[#718096]">{nombreElegido}</p>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const off = n > tope;
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={off}
                        onClick={() => {
                          setServings(n);
                          setPaso("pago");
                        }}
                        className={`min-h-[88px] rounded-[16px] flex flex-col items-center justify-center gap-0.5 ${
                          off
                            ? "bg-[#F0F0F0] text-[#B0B7C3]"
                            : "bg-white border border-[#E0E0E0] text-[#072249]"
                        }`}
                      >
                        <span className="text-[28px] font-bold leading-none">{n}</span>
                        {!off && <span className="text-[15px] font-semibold">{soles(deliveryAmount(precio, n))}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[20px] font-bold text-[#072249]">Cada ración {soles(precio)}</p>
              </>
            )}

            {paso === "pago" && (
              <>
                <h2 className="text-[26px] font-bold text-bosque leading-tight">¿Cómo paga?</h2>
                <p className="text-[18px] text-[#718096]">
                  {nombreElegido} · {servings} ración{servings === 1 ? "" : "es"} · {soles(total)}
                </p>
                <button
                  type="button"
                  disabled={entregando}
                  onClick={() => guardarEntrega("efectivo")}
                  className="min-h-[72px] w-full rounded-[16px] bg-[#0F7BA8] text-white text-[22px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Banknote size={26} /> {entregando ? "Guardando…" : "Pago efectivo"}
                </button>
                <button
                  type="button"
                  disabled={entregando}
                  onClick={() => guardarEntrega("yape")}
                  className="min-h-[72px] w-full rounded-[16px] bg-[#072249] text-white text-[22px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Smartphone size={26} /> {entregando ? "Guardando…" : "Pago Yape"}
                </button>
                <button
                  type="button"
                  disabled={entregando}
                  onClick={() => guardarEntrega("debe")}
                  className="min-h-[72px] w-full rounded-[16px] bg-white border-2 border-[#C5352B] text-[#C5352B] text-[22px] font-bold disabled:opacity-60"
                >
                  {entregando ? "Guardando…" : "Debe"}
                </button>
              </>
            )}

            {paso === "listo" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-4">
                <CheckCircle2 size={72} className="text-[#248341]" />
                <p className="text-[32px] font-bold text-bosque leading-tight">{ENTREGAS_MSG.deliveryOk}</p>
                <button
                  type="button"
                  onClick={() => {
                    setModal(false);
                    setPaso("persona");
                  }}
                  className="min-h-[72px] w-full rounded-[16px] bg-[#0F7BA8] text-white text-[22px] font-bold"
                >
                  Listo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
