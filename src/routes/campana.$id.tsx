import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Heart, Phone, MapPin } from "lucide-react";

export const Route = createFileRoute("/campana/$id")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Campaña — La Ollita" },
    { name: "description", content: "Apoya esta campaña de un comedor popular." },
  ]}),
  component: CampanaPage,
});

function CampanaPage() {
  const { id } = useParams({ from: "/campana/$id" });
  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("campanas").select("*, comedor:comedores(id,nombre,distrito,direccion,yape_numero,telefono_whatsapp,foto_url)").eq("id", id).maybeSingle();
      setC(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-stone-500">Cargando…</div>;
  if (!c) return <div className="p-8 text-center">No encontramos esta campaña.</div>;

  const pct = c.tipo_meta === "dinero" && c.meta_monto ? Math.min(100, (Number(c.avance_monto) / Number(c.meta_monto)) * 100) : null;
  const comedor = c.comedor;
  const wa = comedor.telefono_whatsapp
    ? `https://wa.me/51${comedor.telefono_whatsapp}?text=${encodeURIComponent(`Hola, quiero apoyar la campaña "${c.titulo}".`)}`
    : null;

  return (
    <div className="min-h-screen pb-12">
      <header className="bg-white border-b border-arena px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <Link to="/donaciones" className="size-10 grid place-items-center rounded-full bg-arena/40"><ArrowLeft size={20} /></Link>
        <h1 className="font-display text-xl truncate">Campaña</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {c.foto_url ? (
          <img src={c.foto_url} alt="" className="h-56 w-full object-cover rounded-3xl" />
        ) : (
          <div className="h-48 bg-gradient-to-br from-terracota-suave to-arena/40 rounded-3xl grid place-items-center">
            <Heart size={64} className="text-terracota/60" />
          </div>
        )}
        <section className="space-y-2">
          <Link to="/comedor/$id" params={{ id: comedor.id }} className="text-sm text-terracota font-semibold flex items-center gap-1">
            <MapPin size={14} /> {comedor.nombre} · {comedor.distrito}
          </Link>
          <h2 className="font-display text-3xl">{c.titulo}</h2>
          <p className="text-stone-700">{c.descripcion}</p>
        </section>

        <section className="bg-white border border-arena rounded-3xl p-5 space-y-3">
          {pct !== null ? (
            <>
              <div className="w-full h-4 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-mostaza" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-mostaza">S/ {Number(c.avance_monto).toFixed(2)} recaudados</span>
                <span className="text-stone-500">Meta S/ {Number(c.meta_monto).toFixed(2)}</span>
              </div>
            </>
          ) : (
            <p className="text-stone-700">Necesitamos: <strong>{c.meta_descripcion}</strong></p>
          )}
        </section>

        <section className="bg-terracota-suave border border-terracota/20 rounded-3xl p-5 space-y-3">
          <h3 className="font-display text-xl text-terracota">Cómo apoyar</h3>
          {comedor.yape_numero ? (
            <p><strong>Yape / Plin:</strong> <span className="text-2xl font-display">{comedor.yape_numero}</span></p>
          ) : (
            <p>El comedor coordina las donaciones por WhatsApp.</p>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-grande w-full bg-bosque text-white flex items-center justify-center gap-2">
              <Phone size={18} /> Coordinar por WhatsApp
            </a>
          )}
        </section>
      </main>
    </div>
  );
}