import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { subirFoto } from "@/lib/subirFoto";
import { Camera, CheckCircle2, Trash2 } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCard, PanelCta, PanelField,
  panelInputClass,
} from "@/components/panel-ui";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/panel/menu")({
  head: () => ({ meta: [{ title: "Menús — La Ollita" }] }),
  component: MenuPage,
});

const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function MenuPage() {
  const { comedor, loading } = useMiComedor();
  const canWrite = useCanWrite();
  const hoy = iso(new Date());
  const [fecha, setFecha] = useState<string>(hoy);
  const [menu, setMenu] = useState<any>(null);
  const [plato, setPlato] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [raciones, setRaciones] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const { pending: guardando, run } = useSubmitLock();
  const [ok, setOk] = useState(false);
  const [proximos, setProximos] = useState<any[]>([]);
  const { pending: repitiendo, run: runRepetir } = useSubmitLock();

  const dias = useMemo(() => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  const cargar = async () => {
    if (!comedor) return;
    const { data: m } = await supabase.from("menus").select("*").eq("comedor_id", comedor.id).eq("fecha", fecha).maybeSingle();
    setMenu(m);
    setPlato(m?.nombre_plato ?? "");
    setDescripcion(m?.descripcion ?? "");
    setPrecio(String(m?.precio ?? comedor.precio_menu));
    setRaciones(String(m?.raciones_disponibles ?? comedor.raciones_diarias));
    setFoto(m?.foto_url ?? null);
    const { data: list } = await supabase.from("menus").select("*").eq("comedor_id", comedor.id).gte("fecha", hoy).order("fecha", { ascending: true }).limit(30);
    setProximos(list ?? []);
  };
  useEffect(() => { cargar(); }, [comedor?.id, fecha]);

  if (loading || !comedor) return null;

  const conMenu = new Set(proximos.map((m) => m.fecha));
  const semana = dias.slice(0, 7).filter((d) => conMenu.has(iso(d))).length;
  const sel = new Date(fecha + "T12:00:00");

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subirFoto(file, `comedor/${comedor.id}/menus`); setFoto(url); }
    catch (err: any) { void notifyError(friendlySupabaseError(err?.message ?? "No pudimos subir la foto")); }
    finally { setSubiendo(false); }
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = Math.max(1, Number(raciones) || 0);
    if (!r) { void notifyError("Indica cuántas raciones tendrá el menú."); return; }
    void run(async () => {
      const { error } = await supabase.from("menus").upsert({
        comedor_id: comedor.id,
        fecha,
        nombre_plato: plato.trim(),
        descripcion: descripcion.trim() || null,
        precio: Number(precio),
        publicado: true,
        foto_url: foto,
        raciones_disponibles: r,
      } as any, { onConflict: "comedor_id,fecha" });
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Se guardó el menú.");
      setOk(true); setTimeout(() => setOk(false), 1500);
      await cargar();
    });
  };

  const repetirSemana = () => {
    if (!plato.trim()) { void notifyError("Primero escribe el plato de este día."); return; }
    if (!confirm("¿Copiar este menú a los próximos 6 días?")) return;
    void runRepetir(async () => {
      const filas = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(fecha + "T12:00:00");
        d.setDate(d.getDate() + i + 1);
        return {
          comedor_id: comedor.id,
          fecha: iso(d),
          nombre_plato: plato.trim(),
          descripcion: descripcion.trim() || null,
          precio: Number(precio),
          publicado: true,
          foto_url: foto,
          raciones_disponibles: Math.max(1, Number(raciones) || 1),
        };
      });
      const { error } = await supabase.from("menus").upsert(filas as any, { onConflict: "comedor_id,fecha" });
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Se copió el menú a los próximos 6 días.");
      setOk(true); setTimeout(() => setOk(false), 1500);
      await cargar();
    });
  };

  const borrar = async () => {
    if (!menu || !confirm("¿Borrar este menú?")) return;
    const { error } = await supabase.from("menus").delete().eq("id", menu.id);
    if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
    void notifySuccess("Se eliminó el menú.");
    cargar();
  };

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Menús"
        subtitle={`${semana} de 7 días con menú publicado`}
        action={
          <PanelCta variant="secondary" onClick={repetirSemana} loading={repitiendo} loadingText="Copiando…" className="min-h-12 px-4 text-[15px]">
            Repetir semana
          </PanelCta>
        }
      />

      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          {dias.map((d) => {
            const f = iso(d);
            const activo = f === fecha;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFecha(f)}
                className={`w-[68px] shrink-0 rounded-[16px] py-3 text-center border transition-colors ${
                  activo
                    ? "bg-[#0F7BA8] text-white border-[#0F7BA8] shadow-[0_4px_16px_rgba(15,123,168,0.30)]"
                    : "bg-white border-[#E0E0E0] text-bosque"
                }`}
              >
                <p className={`text-[11px] font-bold tracking-wide ${activo ? "text-white/80" : "text-[#718096]"}`}>{DIAS[d.getDay()]}</p>
                <p className="text-xl font-bold leading-tight">{d.getDate()}</p>
                <span className={`inline-block size-1.5 rounded-full mt-1 ${conMenu.has(f) ? (activo ? "bg-white" : "bg-[#0F7BA8]") : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {canWrite ? (
      <form onSubmit={guardar}>
        <PanelCard>
          <p className="text-[13px] font-bold tracking-[0.06em] text-[#718096] uppercase">
            {DIAS[sel.getDay()]} {sel.getDate()} de {MESES[sel.getMonth()]}
          </p>

          <PanelField label="Plato">
            <input value={plato} onChange={(e) => setPlato(e.target.value)} required placeholder="Ají de gallina" className={panelInputClass()} />
          </PanelField>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Raciones">
              <input type="number" min="1" value={raciones} onChange={(e) => setRaciones(e.target.value)} required className={panelInputClass()} />
            </PanelField>
            <PanelField label="Precio">
              <input type="number" step="0.50" value={precio} onChange={(e) => setPrecio(e.target.value)} required className={panelInputClass()} />
            </PanelField>
          </div>

          <PanelField label="Descripción (opcional)">
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Con arroz y ensalada" className={panelInputClass()} />
          </PanelField>

          {foto ? (
            <div className="relative">
              <img src={foto} alt="" className="w-full h-48 object-cover rounded-[16px]" />
              <button type="button" onClick={() => setFoto(null)} className="absolute top-2 right-2 bg-white/90 rounded-full size-11 grid place-items-center text-[#C5352B] border border-[#E0E0E0]">
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#C5EBF9] text-[#0F7BA8] font-semibold rounded-[16px] min-h-[88px] cursor-pointer hover:bg-terracota-suave">
              <Camera size={20} /> <span>{subiendo ? "Subiendo…" : "Tomar foto del plato"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={onFoto} disabled={subiendo} />
            </label>
          )}

          <PanelCta type="submit" loading={guardando} disabled={subiendo} loadingText="Guardando…" className="w-full">
            {menu ? "Actualizar menú" : "Publicar menú"}
          </PanelCta>
          {menu && (
            <PanelCta type="button" variant="ghost" onClick={borrar} className="w-full min-h-12">
              <Trash2 size={14} /> Borrar menú de este día
            </PanelCta>
          )}
          {ok && (
            <p className="text-bosque text-center font-semibold flex items-center gap-1.5 justify-center">
              <CheckCircle2 size={16} /> Guardado
            </p>
          )}
        </PanelCard>
      </form>
      ) : (
        <PanelCard>
          <p className="text-[13px] font-bold tracking-[0.06em] text-[#718096] uppercase">
            {DIAS[sel.getDay()]} {sel.getDate()} de {MESES[sel.getMonth()]}
          </p>
          {menu ? (
            <>
              {menu.foto_url && <img src={menu.foto_url} alt="" className="w-full h-48 object-cover rounded-[16px]" />}
              <p className="text-[22px] font-bold text-bosque">{menu.nombre_plato}</p>
              {menu.descripcion && <p className="text-[16px] text-[#718096]">{menu.descripcion}</p>}
              <p className="text-[17px] text-[#475569]">
                {menu.raciones_disponibles} raciones · S/ {Number(menu.precio).toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-[17px] text-[#718096]">Sin menú publicado para este día.</p>
          )}
        </PanelCard>
      )}
    </PanelShell>
  );
}
