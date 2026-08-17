import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { Plus, Heart, Camera, Trash2 } from "lucide-react";
import { subirFoto } from "@/lib/subirFoto";

export const Route = createFileRoute("/_authenticated/panel/campanas")({
  head: () => ({ meta: [{ title: "Campañas — La Ollita" }] }),
  component: CampanasPage,
});

function CampanasPage() {
  const { comedor, loading } = useMiComedor();
  const [lista, setLista] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [aporte, setAporte] = useState<any | null>(null);

  const cargar = async () => {
    if (!comedor) return;
    const { data } = await supabase.from("campanas").select("*").eq("comedor_id", comedor.id).order("created_at", { ascending: false });
    setLista(data ?? []);
  };
  useEffect(() => { cargar(); }, [comedor?.id]);

  const toggleActiva = async (c: any) => {
    await supabase.from("campanas").update({ activa: !c.activa }).eq("id", c.id);
    cargar();
  };

  if (loading || !comedor) return null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl text-bosque">Campañas</h2>
        <button onClick={() => setNuevo(true)} className="px-4 py-2 bg-terracota text-white rounded-full text-sm font-semibold flex items-center gap-1"><Plus size={16} /> Nueva</button>
      </div>
      {lista.length === 0 && <p className="text-center text-stone-500 py-8">Aún no tienes campañas. Toca "Nueva" para empezar.</p>}
      {lista.map((c) => {
        const pct = c.tipo_meta === "dinero" && c.meta_monto ? Math.min(100, (Number(c.avance_monto) / Number(c.meta_monto)) * 100) : null;
        return (
          <article key={c.id} className={`bg-white rounded-[20px] border p-4 ${c.activa ? "border-terracota/30" : "border-arena opacity-70"}`}>
            {c.foto_url && <img src={c.foto_url} alt="" className="w-full h-40 object-cover rounded-2xl mb-3" />}
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="text-lg text-bosque">{c.titulo}</h3>
                <p className="text-sm text-stone-600">{c.descripcion}</p>
              </div>
              <button onClick={() => toggleActiva(c)} className={`px-3 py-1 rounded-full text-xs font-bold ${c.activa ? "bg-bosque-suave text-bosque" : "bg-stone-100 text-stone-500"}`}>
                {c.activa ? "Activa" : "Cerrada"}
              </button>
            </div>
            {pct !== null ? (
              <>
                <div className="w-full h-3 bg-stone-100 rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-mostaza" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-sm mt-1"><span>S/ {Number(c.avance_monto).toFixed(2)}</span><span className="text-stone-500">Meta: S/ {Number(c.meta_monto).toFixed(2)}</span></div>
              </>
            ) : (
              <p className="text-sm text-stone-500 mt-2">Meta: {c.meta_descripcion}</p>
            )}
            <button onClick={() => setAporte(c)} className="mt-3 text-sm text-terracota font-semibold flex items-center gap-1"><Heart size={14} /> Registrar aporte</button>
          </article>
        );
      })}

      {nuevo && <FormCamp comedorId={comedor.id} cerrar={() => { setNuevo(false); cargar(); }} />}
      {aporte && <FormAporte campana={aporte} cerrar={() => { setAporte(null); cargar(); }} />}
    </main>
  );
}

function FormCamp({ comedorId, cerrar }: any) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<"dinero" | "especie">("dinero");
  const [meta, setMeta] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const { pending, run } = useSubmitLock();
  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subirFoto(file, `campanas/${comedorId}`); setFotoUrl(url); }
    catch (err: any) { alert("No pudimos subir la foto: " + (err?.message ?? err)); }
    finally { setSubiendo(false); }
  };
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.from("campanas").insert({
        comedor_id: comedorId, titulo: titulo.trim(), descripcion: descripcion.trim() || null,
        tipo_meta: tipo,
        meta_monto: tipo === "dinero" ? Number(meta) : null,
        meta_descripcion: tipo === "especie" ? metaDesc : null,
        activa: true,
        foto_url: fotoUrl,
      } as any);
      if (error) { alert(error.message); return; }
      cerrar();
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={cerrar}>
      <div className="bg-white rounded-[24px] max-w-md w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg text-bosque">Nueva campaña</h3>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <span className="text-sm font-semibold">Foto (opcional)</span>
            {fotoUrl ? (
              <div className="relative mt-1">
                <img src={fotoUrl} alt="" className="w-full h-32 object-cover rounded-2xl" />
                <button type="button" onClick={() => setFotoUrl(null)} className="absolute top-2 right-2 bg-white/90 rounded-full size-9 grid place-items-center text-terracota"><Trash2 size={16} /></button>
              </div>
            ) : (
              <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed border-arena rounded-2xl py-4 cursor-pointer hover:bg-arena/30">
                <Camera size={18} /> <span>{subiendo ? "Subiendo…" : "Agregar foto"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={onFoto} disabled={subiendo} />
              </label>
            )}
          </div>
          <label className="block"><span className="text-sm font-semibold">Título</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} required className="inp mt-1" /></label>
          <label className="block"><span className="text-sm font-semibold">Descripción</span><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="inp mt-1" /></label>
          <label className="block"><span className="text-sm font-semibold">Tipo de meta</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="inp mt-1">
              <option value="dinero">Dinero</option><option value="especie">Especie</option>
            </select></label>
          {tipo === "dinero" ? (
            <label className="block"><span className="text-sm font-semibold">Meta (S/)</span><input type="number" step="1" value={meta} onChange={(e) => setMeta(e.target.value)} required className="inp mt-1" /></label>
          ) : (
            <label className="block"><span className="text-sm font-semibold">Necesitamos</span><input value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} required className="inp mt-1" placeholder="Ej. 20 kg de arroz" /></label>
          )}
          <button type="submit" disabled={pending || subiendo} className="btn-grande w-full bg-terracota text-white disabled:opacity-60">
            {pending ? "Creando…" : "Crear"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FormAporte({ campana, cerrar }: any) {
  const [monto, setMonto] = useState("");
  const { pending, run } = useSubmitLock();
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const nuevo = Number(campana.avance_monto) + Number(monto);
      await supabase.from("campanas").update({ avance_monto: nuevo }).eq("id", campana.id);
      cerrar();
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={cerrar}>
      <div className="bg-white rounded-[24px] max-w-md w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg text-bosque">Registrar aporte</h3>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block"><span className="text-sm font-semibold">Monto recibido (S/)</span><input type="number" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required className="inp mt-1" autoFocus /></label>
          <button type="submit" disabled={pending} className="btn-grande w-full bg-terracota text-white disabled:opacity-60">
            {pending ? "Guardando…" : "Sumar"}
          </button>
        </form>
      </div>
    </div>
  );
}