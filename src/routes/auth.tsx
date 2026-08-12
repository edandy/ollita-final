import { linkRegistroWhatsApp } from "@/lib/contacto";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Store, User } from "lucide-react";
import { z } from "zod";
import logoBlanco from "@/assets/logo-ollita-blanco.svg";
import { emailDeDni, claveDePin, esDni } from "@/lib/dni-cuenta";

const searchSchema = z.object({
  modo: z.enum(["login", "registro"]).optional(),
  tipo: z.enum(["comedor", "cliente"]).optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Iniciar sesión — La Ollita" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [modo, setModo] = useState<"login" | "registro">(search.modo ?? "login");
  const [tipo, setTipo] = useState<"comedor" | "cliente">(search.tipo ?? "comedor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreComedor, setNombreComedor] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        // Sesión vieja o inválida: la limpiamos para poder iniciar sesión
        if (error) supabase.auth.signOut();
        return;
      }
      navigate({ to: "/" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    if (modo === "login") {
      const usuario = email.trim();
      const cred = esDni(usuario)
        ? { email: emailDeDni(usuario), password: claveDePin(usuario, password) }
        : { email: usuario, password };
      const { error } = await supabase.auth.signInWithPassword(cred);
      if (error) { setError(esDni(usuario) ? "DNI o PIN incorrectos" : "Correo o contraseña incorrectos"); setCargando(false); return; }
      // Después de login: si tiene vínculo a comedor → panel; si no → home
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: rol } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
        if (rol) { navigate({ to: "/admin" }); return; }
        const { data: v } = await supabase.from("usuarios_comedor").select("id").eq("user_id", u.user.id).maybeSingle();
        navigate({ to: v ? "/panel" : "/" });
      } else navigate({ to: "/" });
      return;
    }

    // Registro — validar TODO antes de crear la cuenta
    if (!/^\d{9}$/.test(telefono)) { setError("El celular debe tener 9 dígitos"); setCargando(false); return; }
    if (!/^\d{8}$/.test(dni)) { setError("El DNI debe tener 8 dígitos"); setCargando(false); return; }
    if (!nombre.trim()) { setError("Pon tu nombre"); setCargando(false); return; }
    if (tipo === "comedor" && !nombreComedor.trim()) { setError("Pon el nombre del comedor"); setCargando(false); return; }

    const { data, error: eUp } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (eUp || !data.user) { setError(eUp?.message ?? "No pudimos crear la cuenta"); setCargando(false); return; }
    if (!data.session) {
      const { error: eSign } = await supabase.auth.signInWithPassword({ email, password });
      if (eSign) { setError("Cuenta creada. Revisa tu correo para confirmarla y vuelve a ingresar."); setCargando(false); return; }
    }

    if (tipo === "comedor") {
      const { data: comedor, error: e2 } = await supabase
        .from("comedores")
        .insert({
          nombre: nombreComedor, tipo: "comedor",
          direccion: "Por completar", distrito: "Por completar",
          lat: -12.0464, lng: -77.0428,
        })
        .select().single();
      if (e2 || !comedor) { setError(e2?.message ?? "No pudimos crear el comedor"); setCargando(false); return; }
      const { error: eV } = await supabase.from("usuarios_comedor").insert({
        user_id: data.user.id, comedor_id: comedor.id, nombre, cargo: "presidenta",
        telefono, dni,
      });
      if (eV) { setError("Creamos tu cuenta pero no pudimos vincularte al comedor. Intenta iniciar sesión."); setCargando(false); return; }
      navigate({ to: "/panel" });
    } else {
      // Cliente
      const { error: eC } = await supabase.from("clientes").insert({
        user_id: data.user.id, nombre, telefono, dni,
      });
      if (eC) { setError(eC.message); setCargando(false); return; }
      navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FCFCFC]">
      <header className="bg-white border-b border-[#F0F0F0] px-5 py-3.5 flex items-center gap-3">
        <Link to="/" className="size-9 grid place-items-center rounded-full bg-[#F0F0F0] text-bosque">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold text-bosque tracking-tight">
          {modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
      </header>

      <main className="flex-1 px-5 py-5 pb-10 max-w-md mx-auto w-full flex flex-col gap-4">
        {/* Hero navy */}
        <section className="bg-bosque rounded-[20px] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <img src={logoBlanco} alt="La Ollita" className="h-7 w-auto" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {modo === "login" ? "Hola de nuevo" : tipo === "comedor" ? "Registra tu comedor" : "Crea tu cuenta"}
            </h2>
            <p className="text-sm text-terracota-suave">
              {modo === "login"
                ? "Entra para publicar el menú y llevar tu caja."
                : tipo === "comedor"
                  ? "Para socias y dirigentas de comedores u ollas comunes."
                  : "Para apartar raciones y seguir a tus comedores favoritos."}
            </p>
          </div>
        </section>

        {modo === "registro" && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-bosque">¿Cómo vas a usar La Ollita?</span>
            <div className="flex gap-2">
              <TarjetaRol
                activo={tipo === "comedor"} onClick={() => setTipo("comedor")}
                icon={<Store size={26} />} label="Comedor" sub="Publico el menú"
              />
              <TarjetaRol
                activo={tipo === "cliente"} onClick={() => setTipo("cliente")}
                icon={<User size={26} />} label="Comensal" sub="Aparto mi ración"
              />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="card-nos p-5 flex flex-col gap-4">
          {modo === "registro" && (
            <>
              <Campo label="Tu nombre" value={nombre} onChange={setNombre} placeholder="Ej. María Quispe" />
              <Campo label="Celular (9 dígitos)" value={telefono} onChange={(v: string) => setTelefono(v.replace(/\D/g, "").slice(0, 9))} placeholder="987654321" />
              <Campo label="DNI (8 dígitos)" value={dni} onChange={(v: string) => setDni(v.replace(/\D/g, "").slice(0, 8))} placeholder="12345678" />
              {tipo === "comedor" && (
                <Campo label="Nombre del comedor" value={nombreComedor} onChange={setNombreComedor} placeholder="Ej. Comedor Santa Rosa" />
              )}
            </>
          )}
          {modo === "login" ? (
            <>
              <Campo label="DNI o correo" value={email} onChange={setEmail} placeholder="12345678" />
              <Campo label="PIN o contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••" />
            </>
          ) : (
            <>
              <Campo label="Correo" value={email} onChange={setEmail} type="email" placeholder="correo@ejemplo.com" />
              <Campo label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
            </>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={cargando}
            className="btn-grande w-full bg-terracota text-white shadow-[0_4px_16px_rgba(38,86,201,0.30)] disabled:opacity-60"
          >
            {cargando ? "Espera…" : modo === "login" ? "Entrar" : tipo === "comedor" ? "Crear mi cuenta" : "Crear mi cuenta"}
          </button>
        </form>

        {modo === "login" ? (
          <a
            href={linkRegistroWhatsApp()}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-11 grid place-items-center text-center text-terracota font-semibold text-[15px]"
          >
            Aún no tengo cuenta — escríbenos por WhatsApp
          </a>
        ) : (
          <button
            onClick={() => { setModo("login"); setError(null); }}
            className="w-full min-h-11 text-center text-terracota font-semibold text-[15px]"
          >
            Ya tengo cuenta, entrar
          </button>
        )}
      </main>
    </div>
  );
}

function TarjetaRol({ activo, onClick, icon, label, sub }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-h-[104px] rounded-2xl border p-3.5 flex flex-col items-start justify-center gap-1 text-left ${
        activo ? "border-terracota bg-terracota-suave text-bosque" : "border-arena bg-white text-[#475569]"
      }`}
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs opacity-75">{sub}</span>
    </button>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder }: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-bosque">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[52px] w-full rounded-xl border border-arena bg-white px-3.5 text-[15px] text-[#111111] placeholder:text-[#9197B3] outline-none focus:border-terracota"
        required={type !== "text" || label.indexOf("opcional") === -1}
      />
    </div>
  );
}
