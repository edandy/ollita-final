import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, Share2, AlertTriangle, Pencil, UserPlus, Package, Camera, Trash2,
  ChevronDown, ShoppingCart, ChefHat, ClipboardCheck, Plus,
} from "lucide-react";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { subirFoto } from "@/lib/subirFoto";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";
import { generateReservationCode, retryOnUniqueViolation } from "@/lib/reservas";
import { ensureComedorCode } from "@/lib/reservas.functions";
import { todayISO } from "@/lib/dates";
import { PanelWriteGate } from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/")({
  head: () => ({ meta: [{ title: "Hoy — La Ollita" }] }),
  component: Hoy,
});

const hoyISO = () => todayISO();
const marcaKey = (comedorId: string, paso: string) => `ollita:${comedorId}:${hoyISO()}:${paso}`;
function leerMarca(comedorId: string | undefined, paso: string) {
  if (!comedorId || typeof window === "undefined") return false;
  return window.localStorage.getItem(marcaKey(comedorId, paso)) === "1";
}
function guardarMarca(comedorId: string, paso: string, valor: boolean) {
  if (typeof window === "undefined") return;
  if (valor) window.localStorage.setItem(marcaKey(comedorId, paso), "1");
  else window.localStorage.removeItem(marcaKey(comedorId, paso));
}

function Hoy() {
  const { vinculo, comedor, loading } = useMiComedor();
  const fnEnsureCode = useServerFn(ensureComedorCode);
  const [menu, setMenu] = useState<any>(null);
  const [reservas, setReservas] = useState<any[]>([]);
  const [cronoHoy, setCronoHoy] = useState<any>(null);
  const [alertasInsumos, setAlertasInsumos] = useState<{ nombre: string; dias: number }[]>([]);
  const [plato, setPlato] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [raciones, setRaciones] = useState("");
  const { pending: publicando, run: runPublicar } = useSubmitLock();
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [entregaCant, setEntregaCant] = useState("1");
  const [entregaNombre, setEntregaNombre] = useState("");
  const { pending: entregando, run: runEntregar } = useSubmitLock();
  const [padron, setPadron] = useState<any[]>([]);
  const [busqPadron, setBusqPadron] = useState("");
  const [benefSel, setBenefSel] = useState<any>(null);
  const [insumos, setInsumos] = useState<any[]>([]);
  const [consumoAbierto, setConsumoAbierto] = useState(false);
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [agregarInsumo, setAgregarInsumo] = useState(false);

  // Marcas del día (guardadas en el equipo)
  const [revisado, setRevisado] = useState(false);
  const [compraLista, setCompraLista] = useState(false);
  const [cocinaLista, setCocinaLista] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = async () => {
    if (!comedor) return;
    const hoy = hoyISO();
    const [{ data: m }, { data: cr }, { data: ins }] = await Promise.all([
      supabase.from("menus").select("*").eq("comedor_id", comedor.id).eq("fecha", hoy).maybeSingle(),
      supabase.from("cronograma").select("*").eq("comedor_id", comedor.id).eq("fecha", hoy).maybeSingle(),
      supabase.from("insumos").select("id,nombre,unidad,stock_actual,consumo_diario_promedio,precio_referencial").eq("comedor_id", comedor.id).order("nombre"),
    ]);
    setMenu(m);
    setCronoHoy(cr);
    setInsumos(ins ?? []);
    setPrecio(String(comedor.precio_menu));
    setRaciones(String(comedor.raciones_diarias));
    const alertas = (ins ?? [])
      .map((i: any) => ({ nombre: i.nombre, dias: Number(i.consumo_diario_promedio) > 0 ? Math.floor(Number(i.stock_actual) / Number(i.consumo_diario_promedio)) : 99 }))
      .filter((a) => a.dias < 7)
      .sort((a, b) => a.dias - b.dias);
    setAlertasInsumos(alertas);
    if (m) {
      const { data: r } = await supabase.from("reservas").select("*").eq("menu_id", m.id).order("created_at", { ascending: false });
      setReservas(r ?? []);
    } else { setReservas([]); }
    const { data: ben } = await supabase.from("beneficiarios").select("id,nombre_completo,dni,categoria,activo").eq("comedor_id", comedor.id).eq("activo", true).order("nombre_completo");
    setPadron(ben ?? []);
  };

  useEffect(() => { cargar(); }, [comedor?.id]);

  useEffect(() => {
    if (!comedor?.id) return;
    setRevisado(leerMarca(comedor.id, "revision"));
    setCompraLista(leerMarca(comedor.id, "compra"));
    setCocinaLista(leerMarca(comedor.id, "cocina"));
  }, [comedor?.id]);

  if (loading || !comedor) return null;
  const canWrite = useCanWrite();
  const readOnly = !canWrite;

  const marcar = (paso: string, valor: boolean, set: (v: boolean) => void) => {
    if (readOnly) return;
    guardarMarca(comedor.id, paso, valor);
    set(valor);
  };

  const publicar = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const r = Math.max(1, Number(raciones) || 0);
    if (!r) { void notifyError("Indica cuántas raciones vas a cocinar hoy."); return; }
    void runPublicar(async () => {
      const { error } = await supabase.from("menus").upsert({
        comedor_id: comedor.id,
        fecha: hoyISO(),
        nombre_plato: plato.trim(),
        descripcion: descripcion.trim() || null,
        precio: Number(precio),
        publicado: true,
        raciones_disponibles: r,
        foto_url: foto,
      }, { onConflict: "comedor_id,fecha" });
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Se publicó el menú de hoy.");
      setPlato(""); setDescripcion(""); setFoto(null);
      setAbierto(3);
      await cargar();
    });
  };

  const onSubirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0]; if (!file || !comedor) return;
    setSubiendoFoto(true);
    try { const url = await subirFoto(file, `comedor/${comedor.id}/menus`); setFoto(url); }
    catch (err: any) { void notifyError(friendlySupabaseError(err?.message ?? "No pudimos subir la foto")); }
    finally { setSubiendoFoto(false); }
  };

  const marcarRecogida = async (rId: string) => {
    if (readOnly) return;
    const r = reservas.find((x) => x.id === rId);
    const { error } = await supabase.from("reservas").update({ estado: "recogida" }).eq("id", rId);
    if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
    void notifySuccess(r?.nombre_comensal ? `Entregamos la ración de ${r.nombre_comensal}.` : "Marcamos la reserva como entregada.");
    if (r && r.estado !== "recogida" && comedor) {
      const { data: caja } = await supabase.from("caja_dias")
        .select("id, cerrado").eq("comedor_id", comedor.id).eq("fecha", hoyISO()).maybeSingle();
      if (caja && !(caja as any).cerrado) {
        await supabase.from("transacciones").insert({
          caja_dia_id: (caja as any).id,
          tipo: "ingreso",
          categoria: "venta_menus",
          monto: Number(comedor.precio_menu) * Number(r.cantidad),
          nota: `Reserva ${r.codigo} · ${r.nombre_comensal}`,
        });
      }
    }
    cargar();
  };

  const entregarSinReserva = () => {
    if (readOnly || !menu || !comedor) return;
    const cant = Math.max(1, Number(entregaCant) || 1);
    if (menu.raciones_disponibles < cant) { void notifyError("No hay raciones disponibles suficientes."); return; }
    void runEntregar(async () => {
      let kitchenCode = "";
      try {
        const ensured = await fnEnsureCode({ data: { comedor_id: comedor.id } });
        kitchenCode = ensured.code;
      } catch (e: any) {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos generar el código de reserva."));
        return;
      }
      let codigo = "";
      const { error } = await retryOnUniqueViolation(async () => {
        codigo = generateReservationCode({ kitchenCode, enrolled: !!benefSel });
        return supabase.from("reservas").insert({
          menu_id: menu.id,
          comedor_id: comedor.id,
          codigo,
          nombre_comensal: entregaNombre.trim() || null,
          telefono: null,
          cantidad: cant,
          estado: "recogida",
          dni: benefSel?.dni ?? null,
          beneficiario_id: benefSel?.id ?? null,
        } as any);
      });
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Se registró la entrega.");
      const { data: caja } = await supabase.from("caja_dias")
        .select("id, cerrado").eq("comedor_id", comedor.id).eq("fecha", hoyISO()).maybeSingle();
      if (caja && !(caja as any).cerrado) {
        await supabase.from("transacciones").insert({
          caja_dia_id: (caja as any).id,
          tipo: "ingreso",
          categoria: "venta_menus",
          monto: Number(comedor.precio_menu) * cant,
          nota: `Entrega libre ${codigo}${entregaNombre.trim() ? " · " + entregaNombre.trim() : ""} · ${cant} ración(es)`,
        });
      }
      setEntregaCant("1");
      setEntregaNombre("");
      setBenefSel(null);
      setBusqPadron("");
      await cargar();
    });
  };

  const pendientes = reservas.filter((r) => r.estado === "pendiente").reduce((s, r) => s + r.cantidad, 0);
  const entregadas = reservas.filter((r) => r.estado === "recogida").reduce((s, r) => s + r.cantidad, 0);
  const disponibles = menu?.raciones_disponibles ?? 0;
  const totalRaciones = disponibles + pendientes + entregadas;
  const textoWA = menu
    ? `🍲 Hoy en ${comedor.nombre}: ${menu.nombre_plato} a S/ ${Number(menu.precio).toFixed(2)}. ¡Aparta tu ración!`
    : "";

  const pasos = [
    { n: 1, titulo: "Revisar el almacén", resumen: revisado ? "Revisado" : alertasInsumos.length > 0 ? `${alertasInsumos.length} por acabarse` : "Mira qué te falta", hecho: revisado, icono: ClipboardCheck },
    { n: 2, titulo: "Definir el menú de hoy", resumen: menu ? `${menu.nombre_plato} · S/ ${Number(menu.precio).toFixed(2)}` : "Publica el plato y el precio", hecho: !!menu, icono: ChefHat },
    { n: 3, titulo: "Comprar lo que falta", resumen: compraLista ? "Registrado" : "Si necesitas, regístralo aquí", hecho: compraLista, icono: ShoppingCart },
    { n: 4, titulo: "Preparar la comida", resumen: cocinaLista ? "Comida lista" : "Anota los insumos que usaste", hecho: cocinaLista, icono: Package },
    { n: 5, titulo: "Entregar las raciones", resumen: menu ? `${entregadas} entregadas · ${disponibles} disponibles` : "Primero publica el menú", hecho: !!menu && disponibles === 0 && totalRaciones > 0, icono: UserPlus },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  const siguiente = pasos.find((p) => !p.hecho)?.n ?? 5;
  const activo = abierto ?? siguiente;

  return (
    <main className="max-w-[780px] mx-auto px-6 py-6 pb-10 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
      <section className="bg-[#072249] rounded-[20px] p-6 flex flex-col gap-4 text-white">
        <div className="flex flex-col gap-0.5">
          <span className="text-[16px] text-[#A2D9F2]">¡Buen día, {vinculo.nombre}!</span>
          <span className="text-[26px] font-bold tracking-[-0.02em] text-white capitalize">{vinculo.cargo}</span>
        </div>
        {cronoHoy?.directiva_de_turno && (
          <p className="text-[15px] text-[#A2D9F2]">Hoy de turno: <span className="text-white font-semibold">{cronoHoy.directiva_de_turno}</span></p>
        )}
        {cronoHoy?.socias?.length > 0 && (
          <p className="text-[15px] text-[#A2D9F2]/80">Cocinan: {cronoHoy.socias.join(", ")}</p>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] text-[#A2D9F2]">Paso {Math.min(hechos + 1, 5)} de 5</span>
            <span className="text-[16px] font-semibold text-white">{hechos} listos</span>
          </div>
          <div className="h-2 rounded-full bg-[rgba(162,217,242,0.28)] overflow-hidden">
            <div className="h-full bg-[#20A5E0] rounded-full transition-[width]" style={{ width: `${(hechos / 5) * 100}%` }} />
          </div>
        </div>
      </section>

      {[...pasos.filter((p) => !p.hecho), ...pasos.filter((p) => p.hecho)].map((p, idx, arr) => {
        const esActivo = activo === p.n;
        const primerHecho = p.hecho && (idx === 0 || !arr[idx - 1]!.hecho);
        return (
          <div key={p.n} className={primerHecho ? "flex flex-col gap-3 mt-2" : undefined}>
          {primerHecho && (
            <p className="text-[14px] font-bold tracking-[0.06em] uppercase text-[#9197B3]">Ya hiciste esto hoy</p>
          )}
          <Paso paso={p} abierto={esActivo} alternar={() => setAbierto(esActivo ? -1 : p.n)}>
            {p.n === 1 && (
              <div className="flex flex-col gap-3.5">
                {alertasInsumos.length === 0 ? (
                  <p className="text-[17px] text-[#475569] leading-snug">Todo tu almacén alcanza para más de una semana.</p>
                ) : (
                  <div className="bg-[#FDF0D4] border border-[#F5D98A] rounded-[14px] p-3.5 space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-[#8A5A00] text-[15px]">
                      <AlertTriangle size={16} /> Se están acabando
                    </div>
                    {alertasInsumos.slice(0, 5).map((a) => (
                      <p key={a.nombre} className="text-[15px] text-[#8A5A00]">
                        <strong>{a.nombre}</strong> {a.dias <= 0 ? "se acabó" : `alcanza ${a.dias} día${a.dias === 1 ? "" : "s"}`}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2.5">
                  <Link to="/panel/insumos" className="btn-grande bg-white border border-[#E0E0E0] text-[#475569]">Ver el almacén</Link>
                  <PanelWriteGate>
                    <button type="button" onClick={() => { marcar("revision", !revisado, setRevisado); if (!revisado) setAbierto(2); }}
                      className={`btn-grande ${revisado ? "bg-white border border-[#E0E0E0] text-[#475569]" : "border-0 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"}`}>
                      {revisado ? "Desmarcar revisión" : "Ya revisé el almacén"}
                    </button>
                  </PanelWriteGate>
                </div>
              </div>
            )}

            {p.n === 2 && (!menu ? (
              <PanelWriteGate>
              <form onSubmit={publicar} className="flex flex-col gap-3.5">
                <p className="text-[17px] text-[#475569] leading-snug">Escribe el plato del día, las raciones y el precio.</p>
                <Campo label="Plato">
                  <input value={plato} onChange={(e) => setPlato(e.target.value)} required placeholder="Ej. Ají de gallina"
                    className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                </Campo>
                <Campo label="Descripción (opcional)">
                  <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Con arroz y ensalada"
                    className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Precio (S/)">
                    <input type="number" step="0.50" value={precio} onChange={(e) => setPrecio(e.target.value)} required
                      className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                  </Campo>
                  <Campo label="Raciones">
                    <input type="number" min="1" value={raciones} onChange={(e) => setRaciones(e.target.value)} required
                      className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                  </Campo>
                </div>
                <Campo label="Foto del plato (opcional)">
                  {foto ? (
                    <div className="relative">
                      <img src={foto} alt="" className="w-full h-40 object-cover rounded-2xl" />
                      <button type="button" onClick={() => setFoto(null)}
                        className="absolute top-2 right-2 bg-white/90 rounded-full size-9 grid place-items-center text-[#0F7BA8]">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 border border-dashed border-[#A2D9F2] rounded-xl min-h-14 cursor-pointer bg-[#FCFCFC] text-[#0F7BA8] text-[17px] font-semibold hover:border-[#0F7BA8]">
                      <Camera size={18} /> <span>{subiendoFoto ? "Subiendo…" : "Tomar o subir foto"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={onSubirFoto} disabled={subiendoFoto} />
                    </label>
                  )}
                </Campo>
                <button type="submit" disabled={publicando || subiendoFoto} className="btn-grande border-0 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]">
                  {publicando ? "Publicando…" : "Publicar menú"}
                </button>
              </form>
              </PanelWriteGate>
            ) : (
              <div className="flex flex-col gap-3.5">
                <p className="text-[17px] text-[#475569] leading-snug">Ya está publicado. Compártelo para que lleguen reservas.</p>
                {menu.foto_url && <img src={menu.foto_url} alt={menu.nombre_plato} className="w-full h-40 object-cover rounded-2xl" />}
                <div className="bg-[#C5EBF9] rounded-[14px] p-4 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[19px] font-bold text-bosque">{menu.nombre_plato}</span>
                  <span className="text-[22px] font-bold text-bosque shrink-0">S/ {Number(menu.precio).toFixed(2)}</span>
                </div>
                {menu.descripcion && <p className="text-[16px] text-[#718096]">{menu.descripcion}</p>}
                <div className="flex flex-col gap-2.5">
                  <a href={`https://wa.me/?text=${encodeURIComponent(textoWA)}`} target="_blank" rel="noreferrer"
                    className="btn-grande border-0 bg-bosque text-white hover:bg-[#0A2E5E]">
                    <Share2 size={18} /> Compartir por WhatsApp
                  </a>
                  <PanelWriteGate>
                    <Link to="/panel/menu" className="btn-grande bg-white border border-[#E0E0E0] text-[#475569]">
                      <Pencil size={14} /> Cambiar el menú
                    </Link>
                  </PanelWriteGate>
                </div>
              </div>
            ))}

            {p.n === 3 && (
              <div className="flex flex-col gap-3.5">
                <p className="text-[17px] text-[#475569] leading-snug">Si compraste algo hoy, regístralo: entra al almacén y sale de la caja.</p>
                <PanelWriteGate>
                <div className="flex flex-col gap-2.5">
                  <button type="button" onClick={() => setCompraAbierta(true)} disabled={insumos.length === 0}
                    className="btn-grande border-0 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-50">
                    {insumos.length === 0 ? "Primero crea insumos en el almacén" : "Registrar compra de insumos"}
                  </button>
                  <button type="button" onClick={() => setAgregarInsumo(true)}
                    className="btn-grande bg-white border border-[#E0E0E0] text-[#475569]">
                    <Plus size={18} strokeWidth={1.75} /> Agregar insumo
                  </button>
                  <button type="button" onClick={() => { marcar("compra", !compraLista, setCompraLista); if (!compraLista) setAbierto(4); }}
                    className="btn-grande bg-white border border-[#E0E0E0] text-[#475569]">
                    {compraLista ? "Desmarcar" : "No necesito comprar hoy"}
                  </button>
                </div>
                </PanelWriteGate>
              </div>
            )}

            {p.n === 4 && (
              <div className="flex flex-col gap-3.5">
                <p className="text-[17px] text-[#475569] leading-snug">Anota cuánto usaste de cada insumo para que baje del almacén.</p>
                <PanelWriteGate>
                <div className="flex flex-col gap-2.5">
                  <button type="button" onClick={() => setConsumoAbierto(true)} disabled={insumos.length === 0}
                    className="btn-grande border-0 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]">
                    {insumos.length === 0 ? "Aún no hay insumos cargados" : "Registrar consumo del día"}
                  </button>
                  <button type="button" onClick={() => { marcar("cocina", !cocinaLista, setCocinaLista); if (!cocinaLista) setAbierto(5); }}
                    className="btn-grande bg-white border border-[#E0E0E0] text-[#475569]">
                    {cocinaLista ? "Desmarcar" : "La comida ya está lista"}
                  </button>
                </div>
                </PanelWriteGate>
              </div>
            )}

            {p.n === 5 && (!menu ? (
              <p className="text-[17px] text-[#475569] leading-snug">Publica el menú de hoy para poder entregar raciones.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-[17px] text-[#475569] leading-snug">Marca cada reserva cuando la persona recoge su plato.</p>
                <div className="grid grid-cols-3 gap-2.5">
                  <Stat label="Disponibles" value={disponibles} color="text-[#0F7BA8]" />
                  <Stat label="Reservadas" value={pendientes} color="text-[#8A5A00]" />
                  <Stat label="Entregadas" value={entregadas} color="text-bosque" />
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#F0F0F0] overflow-hidden">
                  <div className="h-full rounded-full bg-[#0F7BA8] transition-[width]"
                    style={{ width: `${totalRaciones ? Math.round((entregadas / totalRaciones) * 100) : 0}%` }} />
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[17px] font-bold text-bosque">Reservas de hoy</h4>
                    <Link to="/panel/reservas" className="text-[15px] text-[#0F7BA8] font-semibold">Ver todas →</Link>
                  </div>
                  {reservas.length === 0 && <p className="text-[16px] text-[#718096]">Aún no hay reservas.</p>}
                  {reservas.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between bg-[#FCFCFC] border border-[#E0E0E0] rounded-[14px] p-3.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-[17px] font-semibold text-bosque truncate">{r.nombre_comensal ?? <span className="text-[#718096] italic">Entrega libre</span>}</p>
                        <p className="text-[15px] text-[#718096]">{r.telefono ?? "Sin teléfono"} · {r.cantidad} ración(es) · <span className="font-mono">{r.codigo}</span></p>
                      </div>
                      {r.estado === "recogida" ? (
                        <span className="text-[#248341] text-[15px] font-bold flex items-center gap-1 shrink-0"><CheckCircle2 size={16} /> Entregada</span>
                      ) : (
                        <PanelWriteGate>
                          <button onClick={() => marcarRecogida(r.id)} className="shrink-0 min-h-[52px] px-5 bg-[#0F7BA8] text-white rounded-full text-[16px] font-semibold">
                            Entregar
                          </button>
                        </PanelWriteGate>
                      )}
                    </div>
                  ))}
                </div>

                <PanelWriteGate>
                <div className="border-t border-[#F0F0F0] pt-4 flex flex-col gap-3">
                  <h4 className="text-[17px] font-bold text-bosque">Entregar sin reserva</h4>
                  {disponibles > 0 ? (
                    <>
                      <Campo label="Busca en tu padrón por DNI">
                        <input value={busqPadron}
                          onChange={(e) => { setBusqPadron(e.target.value); setBenefSel(null); }}
                          placeholder="12345678"
                          className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                      </Campo>
                      {benefSel ? (
                        <div className="flex items-center justify-between gap-2 bg-[#C5EBF9] rounded-[14px] p-3.5">
                          <div className="min-w-0">
                            <p className="text-[17px] font-semibold text-bosque truncate">{benefSel.nombre_completo}</p>
                            <p className="text-[15px] text-bosque">DNI {benefSel.dni} · {String(benefSel.categoria).replaceAll("_", " ")}</p>
                          </div>
                          <button type="button" onClick={() => { setBenefSel(null); setEntregaNombre(""); setBusqPadron(""); }}
                            className="text-[15px] font-bold text-[#0F7BA8] shrink-0">Quitar</button>
                        </div>
                      ) : busqPadron.trim().length >= 2 ? (
                        <div className="space-y-1 max-h-44 overflow-y-auto">
                          {padron
                            .filter((b) => b.nombre_completo.toLowerCase().includes(busqPadron.trim().toLowerCase()) || String(b.dni).includes(busqPadron.trim()))
                            .slice(0, 6)
                            .map((b) => (
                              <button key={b.id} type="button"
                                onClick={() => { setBenefSel(b); setEntregaNombre(b.nombre_completo); setBusqPadron(b.nombre_completo); }}
                                className="w-full text-left bg-[#FCFCFC] border border-[#E0E0E0] rounded-xl px-3.5 py-2.5">
                                <p className="font-semibold text-[15px] text-bosque">{b.nombre_completo}</p>
                                <p className="text-[14px] text-[#718096]">DNI {b.dni}</p>
                              </button>
                            ))}
                          <p className="text-[14px] text-[#718096]">Si no está en el padrón, puedes entregar igual.</p>
                        </div>
                      ) : (
                        <p className="text-[14px] text-[#718096]">Opcional. También puedes entregar sin identificar.</p>
                      )}
                      {!benefSel && (
                        <Campo label="Nombre (opcional)">
                          <input value={entregaNombre} onChange={(e) => setEntregaNombre(e.target.value)}
                            placeholder="Ej. María Quispe — o déjalo en blanco"
                            className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                        </Campo>
                      )}
                      <div className="flex items-end gap-2.5">
                        <div className="flex-1">
                          <Campo label="Cantidad">
                            <input type="number" min="1" max={disponibles} value={entregaCant}
                              onChange={(e) => setEntregaCant(e.target.value)}
                              className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
                          </Campo>
                        </div>
                        <button type="button" onClick={entregarSinReserva} disabled={entregando}
                          className="btn-grande w-auto border-0 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] shrink-0 hover:bg-[#0A5F82]">
                          {entregando ? "Entregando…" : "Entregar"}
                        </button>
                      </div>
                      <p className="text-[14px] text-[#718096]">Se descuenta del almacén de raciones y se suma a la caja del día.</p>
                    </>
                  ) : (
                    <p className="text-[16px] text-[#718096]">No quedan raciones disponibles.</p>
                  )}
                </div>
                </PanelWriteGate>
              </div>
            ))}
          </Paso>
          </div>
        );
      })}
      </div>

      {consumoAbierto && canWrite && (
        <ConsumoModal insumos={insumos} cerrar={(guardo) => {
          setConsumoAbierto(false);
          if (guardo) marcar("cocina", true, setCocinaLista);
          cargar();
        }} />
      )}
      {compraAbierta && canWrite && (
        <CompraModal insumos={insumos} comedor={comedor} onListaCambiada={cargar} cerrar={(guardo) => {
          setCompraAbierta(false);
          if (guardo) marcar("compra", true, setCompraLista);
          cargar();
        }} />
      )}
      {agregarInsumo && comedor && canWrite && (
        <FormInsumoHoy
          comedorId={comedor.id}
          cerrar={() => setAgregarInsumo(false)}
          alCrear={() => { setAgregarInsumo(false); cargar(); }}
        />
      )}
    </main>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[15px] font-semibold text-bosque">{label}</label>
      {children}
    </div>
  );
}

function Paso({ paso, abierto, alternar, children }: {
  paso: { n: number; titulo: string; resumen: string; hecho: boolean; icono: any };
  abierto: boolean; alternar: () => void; children: React.ReactNode;
}) {
  const Icono = paso.icono;
  return (
    <section
      className={`bg-white rounded-[18px] overflow-hidden border flex flex-col ${
        abierto && !paso.hecho ? "border-[#0F7BA8]" : "border-[#E0E0E0]"
      }`}
    >
      <button
        type="button"
        onClick={alternar}
        className={`w-full flex items-center gap-3.5 px-5 text-left ${paso.hecho ? "py-4" : "py-[18px]"}`}
      >
        <span className={`size-[46px] shrink-0 grid place-items-center rounded-full ${
          paso.hecho ? "bg-[rgba(52,168,83,0.14)] text-[#248341]" : "bg-[#C5EBF9] text-[#072249]"
        }`}>
          {paso.hecho ? <CheckCircle2 size={26} strokeWidth={2} /> : <Icono size={24} strokeWidth={1.75} />}
        </span>
        <span className="min-w-0 flex-1 flex flex-col gap-0 leading-none">
          <span className="text-[13px] font-bold tracking-[0.06em] uppercase text-[#718096] leading-none">Paso {paso.n}</span>
          <span className={`tracking-[-0.01em] text-[#072249] truncate leading-tight mt-0.5 ${
            paso.hecho ? "text-[19px] font-semibold" : "text-[20px] font-bold"
          }`}>{paso.titulo}</span>
          <span className={`text-[16px] truncate leading-tight ${paso.hecho ? "text-[#248341]" : "text-[#718096]"}`}>{paso.resumen}</span>
        </span>
        <ChevronDown size={26} className={`shrink-0 text-[#718096] transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className={`px-5 pb-5 flex flex-col ${paso.hecho ? "gap-3" : "gap-3.5"}`}>
          {children}
        </div>
      )}
    </section>
  );
}

function CompraModal({ insumos: inicial, comedor, onListaCambiada, cerrar }: {
  insumos: any[];
  comedor: any;
  onListaCambiada: () => void;
  cerrar: (guardo: boolean) => void;
}) {
  const [lista, setLista] = useState(inicial);
  const [filas, setFilas] = useState<Record<string, { cant: string; precio: string }>>({});
  const { pending: guardando, run } = useSubmitLock();
  const [agregar, setAgregar] = useState(false);
  const set = (id: string, campo: "cant" | "precio", v: string) =>
    setFilas((f) => ({ ...f, [id]: { cant: f[id]?.cant ?? "", precio: f[id]?.precio ?? "", [campo]: v } }));

  const total = lista.reduce((s, i) => {
    const f = filas[i.id]; if (!f) return s;
    return s + (Number(f.cant) || 0) * (Number(f.precio) || Number(i.precio_referencial) || 0);
  }, 0);

  const guardar = () => {
    void run(async () => {
      const movimientos: any[] = [];
      const updates: any[] = [];
      for (const i of lista) {
        const f = filas[i.id];
        const c = Number(f?.cant);
        if (!c || c <= 0) continue;
        const pu = Number(f?.precio) || Number(i.precio_referencial) || 0;
        movimientos.push({ insumo_id: i.id, tipo: "ingreso", cantidad: c, precio_unitario: pu || null, nota: "Compra del día" });
        updates.push(supabase.from("insumos").update({ stock_actual: Number(i.stock_actual) + c }).eq("id", i.id));
      }
      if (movimientos.length === 0) { cerrar(false); return; }
      const { error } = await supabase.from("movimientos_insumo").insert(movimientos);
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      await Promise.all(updates);
      void notifySuccess("Se registró la compra.");
      if (total > 0) {
        const { data: caja } = await supabase.from("caja_dias")
          .select("id, cerrado").eq("comedor_id", comedor.id).eq("fecha", hoyISO()).maybeSingle();
        if (caja && !(caja as any).cerrado) {
          await supabase.from("transacciones").insert({
            caja_dia_id: (caja as any).id,
            tipo: "egreso",
            categoria: "compra_insumos",
            monto: total,
            nota: "Compra de insumos del día",
          });
        }
      }
      cerrar(true);
    });
  };

  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-end sm:items-center justify-center p-6" onClick={() => cerrar(false)}>
      <div className="bg-white rounded-[22px] max-w-[520px] w-full p-[26px] flex flex-col gap-[18px] max-h-[100%] overflow-y-auto shadow-[0_12px_40px_rgba(7,34,73,0.30)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-[24px] font-bold text-[#072249] tracking-[-0.02em]">Registrar compra de insumos</h3>
          <p className="text-[17px] text-[#475569]">Entra al almacén y sale de la caja del día.</p>
        </div>
        {lista.map((i) => (
          <div key={i.id} className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold text-[#072249]">{i.nombre} <span className="font-normal text-[#718096]">· hay {Number(i.stock_actual).toFixed(2)} {i.unidad}</span></p>
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" min="0" placeholder={`Cantidad (${i.unidad})`} value={filas[i.id]?.cant ?? ""}
                onChange={(e) => set(i.id, "cant", e.target.value)}
                className="flex-1 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
              <input type="number" step="0.1" min="0" placeholder={`S/ x ${i.unidad}`} value={filas[i.id]?.precio ?? ""}
                onChange={(e) => set(i.id, "precio", e.target.value)}
                className="w-28 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-right text-[#111111] outline-none focus:border-[#0F7BA8]" />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAgregar(true)}
          className="min-h-14 gap-2 inline-flex items-center justify-center rounded-full bg-white border border-[#E0E0E0] text-[#475569] text-[17px] font-semibold hover:border-[#0F7BA8]"
        >
          <Plus size={18} strokeWidth={1.75} /> Agregar insumo
        </button>
        <p className="text-right text-[17px] font-bold text-[#072249]">Total: S/ {total.toFixed(2)}</p>
        <div className="flex gap-2.5 pt-1">
          <button onClick={() => cerrar(false)} className="flex-1 btn-grande bg-white border border-[#E0E0E0] text-[#072249]">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-[1.4] btn-grande bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]">{guardando ? "Guardando…" : "Guardar compra"}</button>
        </div>
      </div>
      {agregar && (
        <FormInsumoHoy
          comedorId={comedor.id}
          cerrar={() => setAgregar(false)}
          alCrear={(nuevo) => {
            setLista((l) => [...l, nuevo]);
            setAgregar(false);
            onListaCambiada();
          }}
        />
      )}
    </div>
  );
}

function FormInsumoHoy({
  comedorId,
  cerrar,
  alCrear,
}: {
  comedorId: string;
  cerrar: () => void;
  alCrear: (insumo: any) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState<"kg" | "L" | "unid">("kg");
  const [stock, setStock] = useState("0");
  const [precio, setPrecio] = useState("");
  const [origen, setOrigen] = useState<"municipalidad" | "comprado" | "donado">("comprado");
  const { pending: guardando, run } = useSubmitLock();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await supabase.from("insumos").insert({
        comedor_id: comedorId,
        nombre: nombre.trim(),
        unidad,
        stock_actual: Number(stock) || 0,
        consumo_diario_promedio: 0,
        precio_referencial: origen === "comprado" && precio ? Number(precio) : null,
        origen,
      }).select("id,nombre,unidad,stock_actual,consumo_diario_promedio,precio_referencial").single();
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Se guardó el insumo.");
      alCrear(data);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[rgba(7,34,73,0.55)] flex items-end sm:items-center justify-center p-6" onClick={(e) => { e.stopPropagation(); cerrar(); }}>
      <div className="bg-white rounded-[22px] max-w-[520px] w-full p-[26px] flex flex-col gap-[18px] max-h-[100%] overflow-y-auto shadow-[0_12px_40px_rgba(7,34,73,0.30)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-[24px] font-bold text-[#072249] tracking-[-0.02em]">Agregar insumo</h3>
          <p className="text-[17px] text-[#475569]">El gasto por día se calcula solo, con las salidas que registres.</p>
        </div>
        <form onSubmit={guardar} className="flex flex-col gap-[18px]">
          <Campo label="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej. Arroz"
              className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Unidad">
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as any)}
                className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] bg-white">
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="unid">unidad</option>
              </select>
            </Campo>
            <Campo label="Stock actual">
              <input type="number" step="0.1" value={stock} onChange={(e) => setStock(e.target.value)}
                className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
            </Campo>
          </div>
          <Campo label="Origen">
            <select value={origen} onChange={(e) => setOrigen(e.target.value as any)}
              className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] bg-white">
              <option value="comprado">Comprado</option>
              <option value="municipalidad">Municipalidad</option>
              <option value="donado">Donado</option>
            </select>
          </Campo>
          {origen === "comprado" && (
            <Campo label="Precio referencial (S/)">
              <input type="number" step="0.10" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00"
                className="w-full h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]" />
              <span className="text-sm text-[#718096]">Para el plan de compra</span>
            </Campo>
          )}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={cerrar} className="flex-1 btn-grande bg-white border border-[#E0E0E0] text-[#072249]">Cancelar</button>
            <button type="submit" disabled={guardando} className="flex-[1.4] btn-grande bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]">
              {guardando ? "Guardando…" : "Guardar insumo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConsumoModal({ insumos, cerrar }: { insumos: any[]; cerrar: (guardo: boolean) => void }) {
  const [cant, setCant] = useState<Record<string, string>>(() =>
    Object.fromEntries(insumos.map((i) => [i.id, String(i.consumo_diario_promedio ?? 0)]))
  );
  const { pending: guardando, run } = useSubmitLock();
  const guardar = () => {
    void run(async () => {
      const movimientos: any[] = [];
      const updates: any[] = [];
      for (const i of insumos) {
        const c = Number(cant[i.id]);
        if (!c || c <= 0) continue;
        movimientos.push({ insumo_id: i.id, tipo: "salida", cantidad: c, nota: "Consumo del día" });
        const nuevo = Math.max(0, Number(i.stock_actual) - c);
        updates.push(supabase.from("insumos").update({ stock_actual: nuevo }).eq("id", i.id));
      }
      if (movimientos.length === 0) { cerrar(false); return; }
      const { error } = await supabase.from("movimientos_insumo").insert(movimientos);
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      await Promise.all(updates);
      void notifySuccess("Se registró el consumo del día.");
      cerrar(true);
    });
  };
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-end sm:items-center justify-center p-6" onClick={() => cerrar(false)}>
      <div className="bg-white rounded-[22px] max-w-[520px] w-full p-[26px] flex flex-col gap-[18px] max-h-[100%] overflow-y-auto shadow-[0_12px_40px_rgba(7,34,73,0.30)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-[24px] font-bold text-[#072249] tracking-[-0.02em]">Registrar consumo del día</h3>
          <p className="text-[17px] text-[#475569]">Anota cuánto usaste para que baje del almacén.</p>
        </div>
        {insumos.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#072249] truncate">{i.nombre}</p>
              <p className="text-[14px] text-[#718096]">Hay: {Number(i.stock_actual).toFixed(2)} {i.unidad}</p>
            </div>
            <input type="number" step="0.1" min="0" value={cant[i.id] ?? ""} onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })}
              className="w-24 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-right text-[#111111] outline-none focus:border-[#0F7BA8]" />
            <span className="text-[14px] text-[#718096] w-8">{i.unidad}</span>
          </div>
        ))}
        <div className="flex gap-2.5 pt-1">
          <button onClick={() => cerrar(false)} className="flex-1 btn-grande bg-white border border-[#E0E0E0] text-[#072249]">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-[1.4] btn-grande bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]">{guardando ? "Guardando…" : "Guardar consumo"}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#FCFCFC] border border-[#E0E0E0] rounded-[14px] p-3.5 text-center flex flex-col gap-0.5">
      <p className="text-[15px] text-[#718096]">{label}</p>
      <p className={`text-[26px] font-bold ${color}`}>{value}</p>
    </div>
  );
}
