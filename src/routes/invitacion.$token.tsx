import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verInvitacion, aceptarInvitacion } from "@/lib/invitaciones.functions";
import { supabase } from "@/integrations/supabase/client";
import { CARGO_LABEL, type Cargo } from "@/lib/permisos";
import { emailDeDni, claveDePin } from "@/lib/dni-cuenta";
import { useSubmitLock } from "@/lib/submit-lock";
import logoBlanco from "@/assets/logo-ollita-blanco.svg";

export const Route = createFileRoute("/invitacion/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Invitación al equipo — La Ollita" },
      { name: "description", content: "Acepta tu invitación y crea tu cuenta para gestionar el comedor en La Ollita." },
      { property: "og:title", content: "Invitación al equipo — La Ollita" },
      { property: "og:description", content: "Acepta tu invitación y crea tu cuenta en La Ollita." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitacionPage,
});

function InvitacionPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fnVer = useServerFn(verInvitacion);
  const fnAceptar = useServerFn(aceptarInvitacion);
  const [info, setInfo] = useState<any>(null);
  const [v, setV] = useState({ nombre: "", pin: "", telefono: "", dni: "" });
  const [o, setO] = useState({
    nombre: "", tipo: "comedor", distrito: "", direccion: "",
    precio_menu: "2", raciones_diarias: "80", telefono_whatsapp: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();

  useEffect(() => {
    fnVer({ data: { token } })
      .then((r: any) => {
        setInfo(r);
        if (r.valida) setV((s) => ({ ...s, nombre: r.nombre ?? "" }));
      })
      .catch(() => setInfo({ valida: false, motivo: "Enlace inválido." }));
  }, [token]);

  if (!info) return <div className="p-8 text-center text-stone-500">Cargando invitación…</div>;

  const esRegistro = info.valida && info.tipo === "registro";

  if (!info.valida) {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-center">
        <div className="space-y-3">
          <h1 className="text-2xl text-bosque">Invitación no disponible</h1>
          <p className="text-stone-600">{info.motivo}</p>
          <Link to="/" className="btn-grande inline-block bg-terracota text-white">Ir al inicio</Link>
        </div>
      </main>
    );
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    void run(async () => {
      try {
        await fnAceptar({
          data: {
            token, ...v, nombre: v.nombre.trim(),
            ...(esRegistro
              ? {
                  olla: {
                    nombre: o.nombre.trim(), tipo: o.tipo, distrito: o.distrito.trim(), direccion: o.direccion.trim(),
                    precio_menu: Number(o.precio_menu) || 0, raciones_diarias: Number(o.raciones_diarias) || 0,
                    telefono_whatsapp: o.telefono_whatsapp.trim(),
                  },
                }
              : {}),
          },
        });
        const { error } = await supabase.auth.signInWithPassword({
          email: emailDeDni(v.dni), password: claveDePin(v.dni, v.pin),
        });
        if (error) { navigate({ to: "/auth" }); return; }
        navigate({ to: "/panel" });
      } catch (e: any) { setErr(e?.message ?? "No pudimos crear tu cuenta"); }
    });
  };

  return (
    <div className="min-h-screen bg-[#FCFCFC] px-5 py-6">
      <main className="max-w-md mx-auto flex flex-col gap-4">
        <section className="bg-bosque rounded-[20px] p-5 space-y-3">
          <img src={logoBlanco} alt="La Ollita" className="h-7 w-auto" />
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {esRegistro ? "Registra tu olla o comedor" : `Te invitaron a ${info.comedor}`}
          </h1>
          <p className="text-sm text-terracota-suave">
            {esRegistro
              ? "Llena los datos de tu olla y crea tu acceso. Entras con tu DNI y un PIN."
              : <>Serás <strong>{CARGO_LABEL[info.cargo as Cargo] ?? info.cargo}</strong>. Entras con tu DNI y un PIN.</>}
          </p>
        </section>

        <form onSubmit={enviar} className="card-nos p-5 flex flex-col gap-4">
          {esRegistro && (
            <>
              <p className="text-sm font-bold text-bosque">Datos de la olla o comedor</p>
              <C label="Nombre de la olla o comedor" value={o.nombre} onChange={(x: string) => setO({ ...o, nombre: x })} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-bosque">Tipo</label>
                <select value={o.tipo} onChange={(e) => setO({ ...o, tipo: e.target.value })}
                  className="h-[52px] w-full rounded-xl border border-arena bg-white px-3.5 text-[15px] outline-none">
                  <option value="comedor">Comedor popular</option>
                  <option value="olla">Olla común</option>
                </select>
              </div>
              <C label="Distrito" value={o.distrito} onChange={(x: string) => setO({ ...o, distrito: x })} />
              <C label="Dirección" value={o.direccion} onChange={(x: string) => setO({ ...o, direccion: x })} />
              <C label="Precio del menú (S/)" value={o.precio_menu} onChange={(x: string) => setO({ ...o, precio_menu: x })} />
              <C label="Raciones que preparan al día" value={o.raciones_diarias} onChange={(x: string) => setO({ ...o, raciones_diarias: x })} />
              <C label="WhatsApp de la olla" value={o.telefono_whatsapp} onChange={(x: string) => setO({ ...o, telefono_whatsapp: x.replace(/\D/g, "").slice(0, 9) })} />
              <p className="text-sm font-bold text-bosque pt-1">Tus datos</p>
            </>
          )}
          <C label="Tu nombre" value={v.nombre} onChange={(x: string) => setV({ ...v, nombre: x })} />
          <C label="Celular (9 dígitos)" value={v.telefono} onChange={(x: string) => setV({ ...v, telefono: x.replace(/\D/g, "").slice(0, 9) })} />
          <C label="DNI (será tu usuario)" value={v.dni} onChange={(x: string) => setV({ ...v, dni: x.replace(/\D/g, "").slice(0, 8) })} />
          <C label="PIN (4 a 8 números)" value={v.pin} onChange={(x: string) => setV({ ...v, pin: x.replace(/\D/g, "").slice(0, 8) })} />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button disabled={guardando} className="btn-grande w-full bg-terracota text-white disabled:opacity-60">
            {guardando ? "Creando…" : esRegistro ? "Registrar mi olla" : "Aceptar invitación"}
          </button>
        </form>
      </main>
    </div>
  );
}

function C({ label, value, onChange, type = "text" }: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-bosque">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required
        className="h-[52px] w-full rounded-xl border border-arena bg-white px-3.5 text-[15px] outline-none focus:border-terracota" />
    </div>
  );
}