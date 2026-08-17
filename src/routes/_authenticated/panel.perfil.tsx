import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { subirFoto } from "@/lib/subirFoto";
import { Camera, Trash2, MapPin, CheckCircle2 } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCard, PanelCta, PanelField,
  panelInputClass, PanelWriteGate,
} from "@/components/panel-ui";
import { useCanWrite } from "@/lib/kitchen-access-context";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/panel/perfil")({
  head: () => ({ meta: [{ title: "Perfil del comedor — La Ollita" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { comedor, loading, recargar } = useMiComedor();
  const canWrite = useCanWrite();
  const [f, setF] = useState<any>(null);
  const { pending: guardando, run } = useSubmitLock();
  const [ok, setOk] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [ubicando, setUbicando] = useState(false);

  useEffect(() => { if (comedor) setF({ ...comedor }); }, [comedor?.id]);

  if (loading || !f) return null;

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.from("comedores").update({
        nombre: f.nombre, descripcion: f.descripcion, direccion: f.direccion, distrito: f.distrito,
        telefono_whatsapp: f.telefono_whatsapp || null,
        yape_numero: f.yape_numero || null,
        raciones_diarias: Number(f.raciones_diarias),
        precio_menu: Number(f.precio_menu),
        precio_menu_publico: f.precio_menu_publico === "" || f.precio_menu_publico == null ? null : Number(f.precio_menu_publico),
        max_raciones_por_reserva: Number(f.max_raciones_por_reserva),
        horario_inicio: f.horario_inicio, horario_fin: f.horario_fin,
        lat: Number(f.lat), lng: Number(f.lng),
        foto_url: f.foto_url ?? null,
      }).eq("id", f.id);
      if (error) { void notifyError(friendlySupabaseError(error.message)); return; }
      void notifySuccess("Guardamos los cambios.");
      setOk(true); setTimeout(() => setOk(false), 1800);
      recargar();
    });
  };

  const upd = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subirFoto(file, `comedor/${f.id}`); setF({ ...f, foto_url: url }); }
    catch (err: any) { void notifyError(friendlySupabaseError(err?.message ?? "No pudimos subir la foto")); }
    finally { setSubiendo(false); }
  };

  const ubicarme = () => {
    if (!navigator.geolocation) { void notifyError("Tu navegador no permite obtener la ubicación."); return; }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((prev: any) => ({ ...prev, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setUbicando(false);
      },
      (err) => { setUbicando(false); void notifyError(friendlySupabaseError(err.message)); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle title="Perfil del comedor" subtitle="Datos públicos, horario y Yape" />

      <form onSubmit={guardar}>
        <PanelCard>
          <PanelWriteGate>
          <PanelField label="Foto del local (opcional)">
            {f.foto_url ? (
              <div className="relative">
                <img src={f.foto_url} alt="" className="w-full h-44 object-cover rounded-[16px]" />
                <button
                  type="button"
                  onClick={() => setF({ ...f, foto_url: null })}
                  className="absolute top-2 right-2 bg-white/90 rounded-full size-11 grid place-items-center text-[#C5352B] border border-[#E0E0E0]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#E0E0E0] text-[#0F7BA8] font-semibold rounded-[16px] min-h-[88px] cursor-pointer hover:bg-terracota-suave">
                <Camera size={18} /> <span>{subiendo ? "Subiendo…" : "Tomar o subir foto"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={onFoto} disabled={subiendo} />
              </label>
            )}
          </PanelField>
          </PanelWriteGate>

          <PanelField label="Nombre">
            <input className={panelInputClass()} value={f.nombre} onChange={upd("nombre")} required readOnly={!canWrite} />
          </PanelField>
          <PanelField label="Descripción">
            <textarea className={panelInputClass("h-auto min-h-[72px] py-3")} rows={2} value={f.descripcion ?? ""} onChange={upd("descripcion")} readOnly={!canWrite} />
          </PanelField>
          <PanelField label="Dirección">
            <input className={panelInputClass()} value={f.direccion} onChange={upd("direccion")} required readOnly={!canWrite} />
          </PanelField>
          <PanelField label="Distrito">
            <input className={panelInputClass()} value={f.distrito} onChange={upd("distrito")} required readOnly={!canWrite} />
          </PanelField>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Horario inicio">
              <input type="time" className={panelInputClass()} value={f.horario_inicio?.slice(0, 5)} onChange={upd("horario_inicio")} readOnly={!canWrite} />
            </PanelField>
            <PanelField label="Horario fin">
              <input type="time" className={panelInputClass()} value={f.horario_fin?.slice(0, 5)} onChange={upd("horario_fin")} readOnly={!canWrite} />
            </PanelField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Raciones diarias">
              <input type="number" className={panelInputClass()} value={f.raciones_diarias} onChange={upd("raciones_diarias")} readOnly={!canWrite} />
            </PanelField>
            <PanelField label="Precio menú (S/)">
              <input type="number" step="0.50" className={panelInputClass()} value={f.precio_menu} onChange={upd("precio_menu")} readOnly={!canWrite} />
            </PanelField>
            <PanelField label="Precio al publico">
              <input type="number" step="0.50" className={panelInputClass()} value={f.precio_menu_publico ?? ""} onChange={upd("precio_menu_publico")} readOnly={!canWrite} />
            </PanelField>
          </div>

          <PanelField label="Máximo raciones por reserva">
            <input type="number" min="1" max="50" className={panelInputClass()} value={f.max_raciones_por_reserva} onChange={upd("max_raciones_por_reserva")} readOnly={!canWrite} />
          </PanelField>
          <PanelField label="WhatsApp (9 dígitos)">
            <input className={panelInputClass()} value={f.telefono_whatsapp ?? ""} onChange={upd("telefono_whatsapp")} readOnly={!canWrite} />
          </PanelField>
          <PanelField label="Yape / Plin">
            <input className={panelInputClass()} value={f.yape_numero ?? ""} onChange={upd("yape_numero")} readOnly={!canWrite} />
          </PanelField>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Latitud">
              <input type="number" step="0.0001" className={panelInputClass()} value={f.lat} onChange={upd("lat")} readOnly={!canWrite} />
            </PanelField>
            <PanelField label="Longitud">
              <input type="number" step="0.0001" className={panelInputClass()} value={f.lng} onChange={upd("lng")} readOnly={!canWrite} />
            </PanelField>
          </div>

          <PanelWriteGate>
          <PanelCta type="button" variant="navy" onClick={ubicarme} disabled={ubicando} className="w-full">
            <MapPin size={18} /> {ubicando ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
          </PanelCta>
          <p className="text-[15px] text-[#718096] -mt-2">
            Párate en la puerta del comedor y toca el botón. También puedes escribir la dirección arriba.
          </p>

          <PanelCta type="submit" loading={guardando} className="w-full">
            Guardar cambios
          </PanelCta>
          </PanelWriteGate>
          {ok && (
            <p className="text-bosque text-center font-semibold flex items-center gap-1.5 justify-center">
              <CheckCircle2 size={16} /> Guardado
            </p>
          )}
        </PanelCard>
      </form>
    </PanelShell>
  );
}
