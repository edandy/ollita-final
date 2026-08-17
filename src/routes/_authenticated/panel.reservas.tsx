import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { Share2, Copy, Plus, Trash2, Search } from "lucide-react";
import { PanelShell, PanelTitle, PanelWriteGate } from "@/components/panel-ui";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { sortReservasForPanel } from "@/lib/reservas";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/panel/reservas")({
  head: () => ({ meta: [{ title: "Reservas — La Ollita" }] }),
  component: ReservasPage,
});

function chipClass(active: boolean) {
  return `min-h-[52px] px-5 rounded-full text-[16px] font-semibold border ${
    active
      ? "bg-[#0F7BA8] border-[#0F7BA8] text-white"
      : "bg-white border-[#E0E0E0] text-[#475569]"
  }`;
}

function ReservasPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const [reservas, setReservas] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "entregadas">("todas");
  const [menuHoy, setMenuHoy] = useState<any>(null);
  const { pending: entregando, run: runEntregar } = useSubmitLock();
  const [entregandoId, setEntregandoId] = useState<string | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = async () => {
    if (!comedor) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const [{ data }, { data: m }] = await Promise.all([
      supabase
        .from("reservas")
        .select("*, menu:menus(fecha), beneficiario:beneficiarios(nombre_completo, categoria)")
        .eq("comedor_id", comedor.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("menus")
        .select("*")
        .eq("comedor_id", comedor.id)
        .eq("fecha", hoy)
        .eq("publicado", true)
        .maybeSingle(),
    ]);
    setReservas(sortReservasForPanel((data ?? []).filter((r: any) => r.menu?.fecha === hoy)));
    setMenuHoy(m);
  };
  useEffect(() => {
    cargar();
  }, [comedor?.id]);

  const setEstado = async (r: any, estado: "recogida" | "no_recogida") => {
    const { error } = await supabase.from("reservas").update({ estado }).eq("id", r.id);
    if (error) throw new Error(friendlySupabaseError(error.message));
    if (estado === "recogida" && r.estado !== "recogida") {
      await registrarIngreso(r);
    }
    await cargar();
  };

  const eliminarReserva = async (r: any) => {
    if (
      !confirm(
        `¿Eliminar la reserva ${r.codigo}${r.nombre_comensal ? ` de ${r.nombre_comensal}` : ""}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    if (r.estado !== "recogida" && r.menu_id) {
      const { data: m } = await supabase
        .from("menus")
        .select("raciones_disponibles")
        .eq("id", r.menu_id)
        .maybeSingle();
      if (m) {
        await supabase
          .from("menus")
          .update({
            raciones_disponibles: Number((m as any).raciones_disponibles) + Number(r.cantidad),
          })
          .eq("id", r.menu_id);
      }
    }
    const { error } = await supabase.from("reservas").delete().eq("id", r.id);
    if (error) {
      void notifyError(friendlySupabaseError(error.message));
      return;
    }
    void notifySuccess("Se eliminó la reserva.");
    cargar();
  };

  const registrarIngreso = async (r: any) => {
    if (!comedor) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: caja } = await supabase
      .from("caja_dias")
      .select("id, cerrado")
      .eq("comedor_id", comedor.id)
      .eq("fecha", hoy)
      .maybeSingle();
    if (!caja || (caja as any).cerrado) return;
    const monto = Number(comedor.precio_menu) * Number(r.cantidad);
    await supabase.from("transacciones").insert({
      caja_dia_id: (caja as any).id,
      tipo: "ingreso",
      categoria: "venta_menus",
      monto,
      nota: `Reserva ${r.codigo} · ${r.nombre_comensal}`,
    });
  };

  const filtradas = sortReservasForPanel(
    reservas.filter((r) => {
      if (filtro === "todas") return true;
      if (filtro === "pendientes") return r.estado === "pendiente";
      return r.estado === "recogida";
    }),
  );

  const entregar = (r: any) => {
    void runEntregar(async () => {
      setEntregandoId(r.id);
      try {
        await setEstado(r, "recogida");
        const quien = r.nombre_comensal?.trim();
        void notifySuccess(quien ? `Entregamos la ración de ${quien}.` : `Marcamos la reserva ${r.codigo} como entregada.`);
      } catch (e: any) {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos marcar la entrega"));
      } finally {
        setEntregandoId(null);
      }
    });
  };

  if (loading || !comedor) return null;

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/comedor/${comedor.id}`
      : `/comedor/${comedor.id}`;
  const mensajeWa = menuHoy
    ? `¡Hola! Hoy en ${comedor.nombre} cocinamos *${menuHoy.nombre_plato}* a S/ ${Number(menuHoy.precio).toFixed(2)}.\nReserva tu ración aquí 👇\n${publicUrl}`
    : `¡Hola! Reserva tu ración en ${comedor.nombre} 👇\n${publicUrl}`;
  const waShareUrl = `https://wa.me/?text=${encodeURIComponent(mensajeWa)}`;
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  };

  return (
    <PanelShell>
      <PanelTitle title="Reservas de hoy" subtitle={`${reservas.length} de hoy`} />

      <div className="flex flex-col gap-4">
        <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[19px] font-bold text-[#072249]">Comparte tu link de reservas</h3>
            <p className="text-[17px] text-[#475569]">
              Tus comensales lo abren por WhatsApp y reservan en 30 segundos.
            </p>
          </div>
          {!menuHoy && (
            <p className="text-[15px] text-[#8A5A00] bg-[#FDF0D4] rounded-xl px-3.5 py-3">
              Publica el menú del día para que las reservas funcionen.
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <a
              href={waShareUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 min-w-[200px] min-h-14 gap-2 inline-flex items-center justify-center rounded-full bg-[#072249] text-white text-[17px] font-semibold hover:bg-[#0A2E5E]"
            >
              <Share2 size={22} strokeWidth={1.75} /> Compartir por WhatsApp
            </a>
            <button
              type="button"
              onClick={copiarLink}
              className="min-h-14 px-5 gap-2 inline-flex items-center justify-center rounded-full border border-[#E0E0E0] bg-white text-[#475569] text-[17px] font-semibold hover:border-[#0F7BA8]"
            >
              <Copy size={22} strokeWidth={1.75} /> {copiado ? "¡Copiado!" : "Copiar link"}
            </button>
          </div>
        </section>

        <div className="flex gap-2.5 flex-wrap">
          {(
            [
              { key: "todas", label: "Todas" },
              { key: "pendientes", label: "Pendientes" },
              { key: "entregadas", label: "Entregadas" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={chipClass(filtro === f.key)}
            >
              {f.label}
            </button>
          ))}
          <PanelWriteGate>
          <button
            type="button"
            onClick={() => setMostrarManual(true)}
            disabled={!menuHoy}
            className="min-h-[52px] px-5 gap-2 inline-flex items-center rounded-full bg-[#0F7BA8] text-white text-[16px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-50"
          >
            <Plus size={20} strokeWidth={2} /> Registrar orden
          </button>
          </PanelWriteGate>
        </div>

        {filtradas.length === 0 && (
          <p className="text-center text-[17px] text-[#718096] py-8">No hay reservas que mostrar.</p>
        )}

        <div className="flex flex-col gap-3">
          {filtradas.map((r) => {
            const entregada = r.estado === "recogida";
            const delPadron = !!r.beneficiario_id;
            return (
              <div
                key={r.id}
                className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-3.5 flex-wrap"
              >
                <div className="flex-1 min-w-[180px] flex flex-col gap-[3px]">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[19px] font-bold text-[#072249]">
                      {r.nombre_comensal ?? (
                        <span className="text-[#718096] italic font-semibold">Entrega libre</span>
                      )}
                    </span>
                    <span
                      className={`text-[14px] font-bold px-2.5 py-[5px] rounded-md ${
                        delPadron
                          ? "bg-[#C5EBF9] text-[#072249]"
                          : "bg-[#F0F0F0] text-[#475569]"
                      }`}
                    >
                      {delPadron ? "Del padrón" : "Público"}
                    </span>
                  </div>
                  <span className="text-[16px] text-[#718096]">
                    {entregada
                      ? `Entregado · ${r.codigo}`
                      : `${r.cantidad} ración(es) · ${r.codigo}${r.telefono ? ` · ${r.telefono}` : ""}`}
                  </span>
                </div>

                <span
                  className={`text-[15px] font-bold px-3 py-[7px] rounded-md whitespace-nowrap ${
                    entregada
                      ? "bg-[rgba(52,168,83,0.14)] text-[#248341]"
                      : r.estado === "no_recogida"
                        ? "bg-[#F0F0F0] text-[#475569]"
                        : "bg-[#FDF0D4] text-[#8A5A00]"
                  }`}
                >
                  {entregada ? "Entregada" : r.estado === "no_recogida" ? "No recogida" : "Pendiente"}
                </span>

                {entregada ? (
                  <button
                    type="button"
                    disabled
                    className="min-h-[52px] px-5 rounded-full bg-[#F0F0F0] text-[#718096] text-[16px] font-semibold cursor-default whitespace-nowrap"
                  >
                    Entregado
                  </button>
                ) : (
                  <PanelWriteGate>
                  <button
                    type="button"
                    onClick={() => entregar(r)}
                    disabled={entregando}
                    className="min-h-[52px] px-[22px] rounded-full bg-[#0F7BA8] text-white text-[16px] font-semibold whitespace-nowrap hover:bg-[#0A5F82] disabled:opacity-60"
                  >
                    {entregando && entregandoId === r.id ? "Entregando…" : "Entregar"}
                  </button>
                  </PanelWriteGate>
                )}

                <PanelWriteGate>
                <button
                  type="button"
                  onClick={() => eliminarReserva(r)}
                  title="Eliminar"
                  aria-label="Eliminar reserva"
                  className="size-12 rounded-full bg-[#FDECEA] text-[#C5352B] grid place-items-center shrink-0 hover:bg-[#F9D8D4]"
                >
                  <Trash2 size={18} strokeWidth={2} />
                </button>
                </PanelWriteGate>
              </div>
            );
          })}
        </div>
      </div>

      {mostrarManual && menuHoy && canWrite && (
        <RegistrarOrdenManual
          comedor={comedor}
          menu={menuHoy}
          cerrar={() => setMostrarManual(false)}
          listo={() => {
            setMostrarManual(false);
            cargar();
          }}
        />
      )}
    </PanelShell>
  );
}

function RegistrarOrdenManual({ comedor, menu, cerrar, listo }: any) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const { pending: enviando, run } = useSubmitLock();
  const [buscando, setBuscando] = useState(false);
  const [benef, setBenef] = useState<any>(null);
  const [avisoPadron, setAvisoPadron] = useState<string | null>(null);
  const [busq, setBusq] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);

  const elegir = (b: any) => {
    setBenef(b);
    setNombre(b.nombre_completo);
    setDni(b.dni ?? "");
    if (b.telefono) setTelefono(String(b.telefono).replace(/\D/g, "").slice(0, 9));
    setResultados([]);
    setBusq(b.nombre_completo);
    setAvisoPadron(null);
  };

  const buscarEnPadron = async () => {
    setError(null);
    setAvisoPadron(null);
    setResultados([]);
    const t = busq.trim();
    if (t.length < 2) return setError("Escribe un DNI o al menos 2 letras del nombre");
    setBuscando(true);
    const q = supabase
      .from("beneficiarios")
      .select("id, nombre_completo, dni, categoria, telefono, activo")
      .eq("comedor_id", comedor.id)
      .eq("activo", true);
    const { data } = /^\d+$/.test(t)
      ? await q.ilike("dni", `${t}%`).limit(8)
      : await q.ilike("nombre_completo", `%${t}%`).limit(8);
    setBuscando(false);
    const lista = data ?? [];
    if (lista.length === 0) {
      setBenef(null);
      setAvisoPadron("No está en el padrón. Puedes registrar la orden como público.");
      return;
    }
    if (lista.length === 1) {
      elegir(lista[0]);
      return;
    }
    setResultados(lista);
  };

  const generarCodigo = () => {
    const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "M-";
    for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("Pon el nombre del comensal");
    if (telefono && !/^\d{9}$/.test(telefono)) return setError("El celular debe tener 9 dígitos");
    if (dni && !/^\d{8}$/.test(dni)) return setError("El DNI debe tener 8 dígitos");
    const maxPor = comedor.max_raciones_por_reserva ?? 5;
    if (cantidad < 1 || cantidad > maxPor) return setError(`Entre 1 y ${maxPor} raciones`);
    if (cantidad > menu.raciones_disponibles) return setError("No hay tantas raciones disponibles");

    void run(async () => {
      const codigo = generarCodigo();
      const { error: err } = await supabase.from("reservas").insert({
        menu_id: menu.id,
        comedor_id: comedor.id,
        codigo,
        nombre_comensal: nombre.trim(),
        telefono: telefono || null,
        dni: dni || null,
        cantidad,
        beneficiario_id: benef?.id ?? null,
      });
      if (err) {
        setError(friendlySupabaseError(err.message));
        void notifyError(friendlySupabaseError(err.message));
        return;
      }
      void notifySuccess("Se guardó la orden.");

      const total = (cantidad * Number(menu.precio)).toFixed(2);
      const msg = `¡Hola ${nombre.trim()}! Te reservé ${cantidad} ración(es) de *${menu.nombre_plato}* en ${comedor.nombre}.\nCódigo: *${codigo}*\nTotal: S/ ${total}\nRecoge antes de la 1:00 pm.`;
      const waUrl = telefono
        ? `https://wa.me/51${telefono}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
      listo();
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
          <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Registrar orden</h3>
          <p className="text-[17px] text-[#475569]">
            Para quienes avisan por WhatsApp o en persona. Al guardar abrimos WhatsApp con la confirmación.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-semibold text-[#072249]">Busca en tu padrón por DNI</label>
            <div className="flex gap-2.5">
              <input
                value={busq}
                onChange={(e) => {
                  setBusq(e.target.value);
                  setBenef(null);
                  setAvisoPadron(null);
                  setResultados([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscarEnPadron();
                  }
                }}
                className="flex-1 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] min-w-0"
                placeholder="12345678"
                autoFocus
              />
              <button
                type="button"
                onClick={buscarEnPadron}
                disabled={buscando}
                className="size-14 rounded-xl bg-[#0F7BA8] text-white grid place-items-center shrink-0 hover:bg-[#0A5F82] disabled:opacity-60"
              >
                <Search size={22} />
              </button>
            </div>
            {resultados.length > 0 && (
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {resultados.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => elegir(b)}
                    className="w-full text-left bg-[#FCFCFC] border border-[#E0E0E0] rounded-xl px-3.5 py-2.5"
                  >
                    <p className="font-semibold text-[15px] text-[#072249]">{b.nombre_completo}</p>
                    <p className="text-[14px] text-[#718096]">DNI {b.dni}</p>
                  </button>
                ))}
              </div>
            )}
            {benef && (
              <p className="text-[16px] text-[#072249] font-semibold">
                ✓ {benef.nombre_completo} · DNI {benef.dni}
              </p>
            )}
            {avisoPadron && <p className="text-[16px] text-[#718096]">{avisoPadron}</p>}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">DNI · opcional</span>
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] outline-none focus:border-[#0F7BA8]"
              placeholder="12345678"
              inputMode="numeric"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">Nombre del comensal</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              readOnly={!!benef}
              className="h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] outline-none focus:border-[#0F7BA8] read-only:bg-[#FCFCFC]"
              placeholder="Ej. María Quispe"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">Celular · opcional</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
              className="h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] outline-none focus:border-[#0F7BA8]"
              placeholder="987654321"
              inputMode="numeric"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#072249]">Raciones</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                className="size-12 rounded-full border border-[#E0E0E0] bg-white text-[22px] font-bold text-[#072249]"
              >
                −
              </button>
              <span className="text-[28px] font-bold w-12 text-center text-[#072249]">{cantidad}</span>
              <button
                type="button"
                onClick={() =>
                  setCantidad(Math.min(comedor.max_raciones_por_reserva ?? 5, cantidad + 1))
                }
                className="size-12 rounded-full border border-[#E0E0E0] bg-white text-[22px] font-bold text-[#072249]"
              >
                +
              </button>
              <span className="ml-auto text-[16px] text-[#718096]">
                Total S/ {(cantidad * Number(menu.precio)).toFixed(2)}
              </span>
            </div>
          </div>

          {error && <p className="text-[15px] text-[#C5352B]">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={cerrar}
              className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
            >
              {enviando ? "Guardando…" : "Guardar orden"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
