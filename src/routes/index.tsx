import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, List, Map as MapIcon, Search, ChevronDown } from "lucide-react";
import { MapaGoogle } from "@/components/MapaGoogle";
import logoOllita from "@/assets/logo-ollita.svg";
import { linkRegistroWhatsApp } from "@/lib/contacto";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "La Ollita — Encuentra tu menú del día" },
      {
        name: "description",
        content:
          "Mapa de comedores populares y ollas comunes en Lima. Mira el menú, aparta tu ración y apoya las campañas.",
      },
    ],
  }),
  component: Index,
});

type TipoComedor = "comedor" | "olla" | "restaurante";
type Filtro = "todos" | "social" | "menu";

type Comedor = {
  id: string;
  nombre: string;
  tipo: TipoComedor;
  distrito: string;
  direccion: string;
  lat: number;
  lng: number;
  horario_inicio: string;
  horario_fin: string;
  raciones_diarias: number;
  precio_menu: number;
  foto_url: string | null;
  menu_hoy?: { nombre_plato: string; precio: number; raciones_disponibles: number } | null;
};

function tipoLabel(t: TipoComedor) {
  if (t === "olla") return "Olla común";
  if (t === "restaurante") return "Negocio de menú";
  return "Comedor popular";
}

function esSocial(t: TipoComedor) {
  return t === "comedor" || t === "olla";
}

function formatHora(h: string) {
  const [hh, mm] = h.slice(0, 5).split(":");
  const n = Number(hh);
  const m = mm ?? "00";
  if (n === 0) return `12:${m} am`;
  if (n < 12) return `${n}:${m} am`;
  if (n === 12) return `12:${m} pm`;
  return `${n - 12}:${m} pm`;
}

function horarioTexto(c: Comedor, abierto: boolean) {
  const ini = formatHora(c.horario_inicio);
  const fin = formatHora(c.horario_fin);
  if (!abierto) return `Abre mañana ${ini}`;
  if (esSocial(c.tipo)) return `Recojo ${ini} – ${fin}`;
  return `Atiende ${ini} – ${fin}`;
}

function Index() {
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
  const [comedores, setComedores] = useState<Comedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [distrito, setDistrito] = useState("");

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase
        .from("comedores")
        .select(
          "id,nombre,tipo,distrito,direccion,lat,lng,horario_inicio,horario_fin,raciones_diarias,precio_menu,foto_url",
        )
        .eq("activo", true);
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: menus } = await supabase
        .from("menus")
        .select("comedor_id,nombre_plato,precio,raciones_disponibles")
        .eq("fecha", hoy)
        .eq("publicado", true);
      const byComedor = new Map((menus ?? []).map((m: any) => [m.comedor_id, m]));
      setComedores(
        (cs ?? []).map((c: any) => ({
          ...c,
          menu_hoy: byComedor.get(c.id) ?? null,
        })),
      );
      setLoading(false);
    })();
  }, []);

  const distritos = useMemo(() => {
    const set = new Set(comedores.map((c) => c.distrito).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [comedores]);

  const nAbiertos = useMemo(
    () => comedores.filter((c) => estaAbierto(c.horario_inicio, c.horario_fin)).length,
    [comedores],
  );
  const nRaciones = useMemo(
    () =>
      comedores.reduce((n, c) => n + (c.menu_hoy?.raciones_disponibles ?? 0), 0),
    [comedores],
  );

  const filtrados = useMemo(() => {
    const query = q.trim().toLowerCase();
    return comedores
      .filter((c) => {
        if (filtro === "social" && !esSocial(c.tipo)) return false;
        if (filtro === "menu" && c.tipo !== "restaurante") return false;
        if (distrito && c.distrito !== distrito) return false;
        if (query && !c.nombre.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => {
        const aa = estaAbierto(a.horario_inicio, a.horario_fin);
        const bb = estaAbierto(b.horario_inicio, b.horario_fin);
        if (aa === bb) return 0;
        return aa ? -1 : 1;
      });
  }, [comedores, filtro, q, distrito]);

  const filtros: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "social", label: "Comedores y ollas" },
    { key: "menu", label: "Menús del día" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F0F0] text-[#072249]">
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-7 pb-16 flex flex-col gap-6">
        <section className="bg-[#072249] rounded-[24px] px-5 py-7 sm:px-9 sm:py-8 flex flex-col gap-6">
          <div className="flex items-end justify-between gap-8 flex-wrap">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[15px] font-bold tracking-[0.06em] uppercase text-[#A2D9F2]">
                Hoy en el barrio
              </span>
              <h1 className="text-[28px] sm:text-[36px] font-bold text-white tracking-[-0.02em] leading-tight">
                Encuentra tu plato del día
              </h1>
              <p className="text-[17px] text-[#A2D9F2]">
                Mira el menú, el horario y aparta tu ración.
              </p>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-0.5">
                <span className="text-[28px] font-bold text-white leading-none">{nAbiertos}</span>
                <span className="text-[15px] text-[#A2D9F2]">abiertos ahora</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[28px] font-bold text-white leading-none">
                  {nRaciones.toLocaleString("es-PE")}
                </span>
                <span className="text-[15px] text-[#A2D9F2]">raciones libres</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[280px] h-14 bg-white rounded-xl px-[18px] flex items-center gap-2.5">
              <Search size={22} className="text-[#718096] shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Busca por nombre del comedor"
                className="flex-1 border-0 outline-none text-[17px] text-[#111111] bg-transparent min-w-0"
              />
            </div>
            <div className="relative min-w-[220px] h-14 bg-white rounded-xl px-[18px] flex items-center gap-2.5">
              <MapPin size={22} className="text-[#718096] shrink-0" strokeWidth={1.75} />
              <select
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                className="flex-1 appearance-none border-0 outline-none text-[17px] text-[#072249] bg-transparent cursor-pointer pr-6 min-w-0"
                aria-label="Distrito"
              >
                <option value="">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={22}
                className="text-[#718096] shrink-0 absolute right-[18px] pointer-events-none"
                strokeWidth={1.75}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2.5 flex-wrap">
            {filtros.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={`min-h-[52px] px-[22px] rounded-full text-[16px] font-semibold border ${
                  filtro === f.key
                    ? "bg-[#0F7BA8] border-[#0F7BA8] text-white"
                    : "bg-white border-[#E0E0E0] text-[#475569]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white border border-[#E0E0E0] rounded-full p-1">
            <button
              type="button"
              onClick={() => setVista("lista")}
              className={`min-h-12 px-[18px] gap-2 inline-flex items-center rounded-full text-[16px] font-semibold ${
                vista === "lista" ? "bg-[#C5EBF9] text-[#072249]" : "bg-transparent text-[#718096]"
              }`}
            >
              <List size={22} strokeWidth={1.75} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setVista("mapa")}
              className={`min-h-12 px-[18px] gap-2 inline-flex items-center rounded-full text-[16px] font-semibold ${
                vista === "mapa" ? "bg-[#C5EBF9] text-[#072249]" : "bg-transparent text-[#718096]"
              }`}
            >
              <MapIcon size={22} strokeWidth={1.75} /> Mapa
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-[#718096] text-[17px] py-12">Cargando…</p>
        ) : vista === "lista" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            {filtrados.map((c) => (
              <TarjetaComedor key={c.id} comedor={c} />
            ))}
            {filtrados.length === 0 && (
              <p className="col-span-full text-center text-[#718096] text-[17px] py-12">
                No hay comedores con ese filtro.
              </p>
            )}
          </div>
        ) : (
          <MapaComedores comedores={filtrados} />
        )}
      </main>
    </div>
  );
}

function Header() {
  const [user, setUser] = useState<any>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [esSupervisor, setEsSupervisor] = useState(false);
  const [tieneComedor, setTieneComedor] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setEsAdmin(false);
      setEsSupervisor(false);
      setTieneComedor(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const roles = (data ?? []).map((r) => r.role);
        setEsAdmin(roles.includes("admin"));
        setEsSupervisor(roles.includes("supervisor"));
      });
    supabase
      .from("usuarios_comedor")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setTieneComedor(!!data));
  }, [user]);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const btnOutline =
    "min-h-12 px-[22px] inline-flex items-center justify-center rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[16px] font-semibold hover:border-[#0F7BA8]";
  const btnPrimary =
    "min-h-12 px-6 inline-flex items-center justify-center rounded-full bg-[#0F7BA8] text-white text-[16px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]";
  const btnNavy =
    "min-h-12 px-[22px] inline-flex items-center justify-center rounded-full bg-[#072249] text-white text-[16px] font-semibold hover:bg-[#0A2E5E]";

  return (
    <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-4 flex items-center gap-4 flex-wrap">
        <Link to="/" className="flex items-center shrink-0">
          <img src={logoOllita} alt="La Ollita" className="h-9 w-auto" />
          <h1 className="sr-only">La Ollita</h1>
        </Link>
        <span className="flex-1" />
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {user ? (
            <>
              {(esAdmin || esSupervisor) && (
                <Link to="/admin" className={btnPrimary}>
                  Administración
                </Link>
              )}
              {tieneComedor && (
                <Link to="/panel" className={btnNavy}>
                  Mi comedor
                </Link>
              )}
              <button type="button" onClick={cerrarSesion} className={btnOutline}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" search={{ modo: "login" }} className={btnOutline}>
                Iniciar sesión
              </Link>
              <a
                href={linkRegistroWhatsApp()}
                target="_blank"
                rel="noopener noreferrer"
                className={btnPrimary}
              >
                Registrar mi comedor
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function TarjetaComedor({ comedor }: { comedor: Comedor }) {
  const abierto = estaAbierto(comedor.horario_inicio, comedor.horario_fin);
  const raciones = comedor.menu_hoy?.raciones_disponibles ?? 0;
  const tieneMenu = !!comedor.menu_hoy;
  const social = esSocial(comedor.tipo);

  return (
    <article className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`text-[14px] font-bold px-2.5 py-[5px] rounded-md ${
            social ? "bg-[#C5EBF9] text-[#072249]" : "bg-[#F0F0F0] text-[#475569]"
          }`}
        >
          {tipoLabel(comedor.tipo)}
        </span>
        <span
          className={`text-[14px] font-bold px-2.5 py-[5px] rounded-md whitespace-nowrap ${
            abierto
              ? "bg-[rgba(52,168,83,0.14)] text-[#248341]"
              : "bg-[#F0F0F0] text-[#718096]"
          }`}
        >
          {abierto ? "Abierto" : "Cerrado"}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[20px] font-bold text-[#072249] tracking-[-0.01em] leading-tight">
          {comedor.nombre}
        </h3>
        <p className="flex items-center gap-1.5 text-[15px] text-[#718096]">
          <MapPin size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{comedor.direccion || comedor.distrito}</span>
        </p>
      </div>

      <div
        className={`rounded-[14px] p-4 ${tieneMenu ? "bg-[#C5EBF9]" : "bg-[#F0F0F0]"}`}
      >
        {tieneMenu ? (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold tracking-[0.06em] uppercase text-[#072249]">
              Menú de hoy
            </span>
            <span className="text-[17px] font-semibold text-[#072249]">
              {comedor.menu_hoy!.nombre_plato}
            </span>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[24px] font-bold text-[#072249]">
                S/ {Number(comedor.menu_hoy!.precio).toFixed(2)}
              </span>
              <span className="bg-white text-[#072249] text-[14px] font-bold px-3 py-1.5 rounded-md">
                {raciones} libres
              </span>
            </div>
          </div>
        ) : (
          <span className="text-[16px] text-[#718096]">Aún no publica el menú de hoy.</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-0.5">
        <span className="text-[15px] text-[#718096]">{horarioTexto(comedor, abierto)}</span>
        <Link
          to="/comedor/$id"
          params={{ id: comedor.id }}
          className={`min-h-[52px] px-6 inline-flex items-center justify-center rounded-full text-[16px] font-semibold whitespace-nowrap ${
            abierto
              ? "bg-[#0F7BA8] text-white border-0 hover:bg-[#0A5F82]"
              : "bg-white text-[#0F7BA8] border border-[#E0E0E0] hover:border-[#0F7BA8]"
          }`}
        >
          {abierto ? "Apartar" : "Ver comedor"}
        </Link>
      </div>
    </article>
  );
}

function MapaComedores({ comedores }: { comedores: Comedor[] }) {
  const navigate = useNavigate();

  if (comedores.length === 0) {
    return (
      <p className="text-center text-[#718096] text-[17px] py-12">
        No hay comedores con ese filtro.
      </p>
    );
  }

  return (
    <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-5 flex flex-col gap-4">
      <div className="h-[420px] rounded-2xl overflow-hidden relative bg-[#C5EBF9]">
        <MapaGoogle
          puntos={comedores.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            distrito: c.distrito,
            lat: c.lat,
            lng: c.lng,
            menu_hoy: c.menu_hoy
              ? { nombre_plato: c.menu_hoy.nombre_plato, precio: c.menu_hoy.precio }
              : null,
          }))}
          onSeleccionar={(id) => navigate({ to: "/comedor/$id", params: { id } })}
        />
      </div>
      <p className="text-[15px] text-[#072249]/70">
        Vista de mapa · los comedores abiertos aparecen en celeste
      </p>
    </section>
  );
}

function estaAbierto(inicio: string, fin: string) {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  return hhmm >= inicio.slice(0, 5) && hhmm <= fin.slice(0, 5);
}
