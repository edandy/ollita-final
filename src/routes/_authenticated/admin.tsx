import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  soyAdmin, adminListarComedores, adminActivarComedor, adminCrearComedor, adminEliminarComedor,
  adminCrearInvitacion, adminListarUsuarios, adminCrearUsuario, adminCambiarCargo, adminEliminarUsuario,
  adminActualizarComedor, adminCrearEnlaceRegistro, adminActividadDiaria,
} from "@/lib/admin.functions";
import { EnlaceInvitacion } from "@/components/EnlaceInvitacion";
import logoBlanco from "@/assets/logo-ollita-blanco.svg";
import {
  Plus, Power, Trash2, Link2, Users, Utensils, ClipboardList, Menu, X, LayoutGrid,
  UserCog, Pencil, ArrowRight, CalendarCheck, Check, Minus, Search, MoreVertical, LogOut,
} from "lucide-react";

const CARGOS = ["presidenta", "vicepresidenta", "tesorera", "almacenera", "cocinera", "secretaria", "fiscal", "vocal", "socia"] as const;

type Seccion = "ollas" | "nueva" | "usuarios" | "actividad";

const NAV: { key: Seccion; label: string; icon: typeof LayoutGrid }[] = [
  { key: "ollas", label: "Ollas y comedores", icon: LayoutGrid },
  { key: "nueva", label: "Nueva olla y enlace", icon: Plus },
  { key: "usuarios", label: "Supervisores", icon: UserCog },
  { key: "actividad", label: "Uso diario", icon: CalendarCheck },
];

const TITULOS: Record<Seccion, { titulo: string; sub: (t: Totales, nGestores?: number, dias?: number) => string }> = {
  ollas: {
    titulo: "Ollas y comedores",
    sub: (t) => `${t.comedores} registrados · ${t.activos} activos`,
  },
  nueva: {
    titulo: "Nueva olla y enlace",
    sub: () => "Crea la olla o manda el enlace para que se registre sola",
  },
  usuarios: {
    titulo: "Supervisores",
    sub: (_t, n = 0) => `${n} gestores con acceso a ollas`,
  },
  actividad: {
    titulo: "Uso diario",
    sub: (_t, _n, dias = 14) => `Últimos ${dias} días`,
  },
};

type Fila = {
  id: string; nombre: string; tipo: string; distrito: string; direccion: string;
  activo: boolean; precio_menu: number; raciones_diarias: number;
  telefono_whatsapp: string | null; yape_numero: string | null;
  socias: number; beneficiarios: number; reservas: number;
};

type Totales = { comedores: number; activos: number; socias: number; beneficiarios: number };

type Confirmacion = {
  titulo: string;
  texto: string;
  onConfirm: () => Promise<void> | void;
};

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administración — La Ollita" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const fnAdmin = useServerFn(soyAdmin);
  const fnListar = useServerFn(adminListarComedores);
  const fnActivar = useServerFn(adminActivarComedor);
  const fnEliminar = useServerFn(adminEliminarComedor);
  const [ok, setOk] = useState<boolean | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [invitando, setInvitando] = useState<Fila | null>(null);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [menuCard, setMenuCard] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState<Seccion>("ollas");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarNuevoUsuario, setMostrarNuevoUsuario] = useState(false);
  const [conteoGestores, setConteoGestores] = useState(0);
  const [diasActividad, setDiasActividad] = useState(14);

  const cargar = async () => {
    const r = await fnListar({});
    setFilas(r as Fila[]);
  };

  useEffect(() => {
    fnAdmin({})
      .then(async (r: any) => {
        setOk(!!r.admin);
        if (r.admin) {
          try { await cargar(); } catch (e) { console.error("No se pudo cargar el panel admin:", e); }
        }
      })
      .catch((e) => {
        console.error("Error verificando admin:", e);
        setOk(false);
      });
  }, []);

  useEffect(() => {
    const cerrar = () => setMenuCard(null);
    if (menuCard) {
      window.addEventListener("click", cerrar);
      return () => window.removeEventListener("click", cerrar);
    }
  }, [menuCard]);

  if (ok === null) {
    return <div className="min-h-screen grid place-items-center text-[#718096]">Cargando…</div>;
  }
  if (!ok) {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-center bg-[#F0F0F0]">
        <div className="space-y-3">
          <h2 className="text-2xl text-bosque">Área de administración</h2>
          <p className="text-[#718096]">Tu cuenta no tiene permiso para ver esta sección.</p>
          <Link to="/" className="btn-grande inline-flex items-center justify-center px-6 bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)]">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  const lista = filas.filter((f) =>
    (f.nombre + " " + f.distrito + " " + f.tipo).toLowerCase().includes(q.trim().toLowerCase()));
  const totales: Totales = {
    comedores: filas.length,
    activos: filas.filter((f) => f.activo).length,
    socias: filas.reduce((a, f) => a + f.socias, 0),
    beneficiarios: filas.reduce((a, f) => a + f.beneficiarios, 0),
  };

  const meta = TITULOS[seccion];
  const hayCta = seccion === "ollas" || seccion === "usuarios";
  const ctaLabel = seccion === "usuarios" ? "Nuevo gestor" : "Nueva olla";

  const irSeccion = (s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    setMenuCard(null);
    if (s !== "usuarios") setMostrarNuevoUsuario(false);
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const tipoLabel = (t: string) =>
    t === "olla" ? "Olla común" : t === "restaurante" ? "Negocio de menú" : "Comedor popular";

  return (
    <div className="min-h-screen flex bg-[#F0F0F0] text-bosque">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-bosque p-5 flex flex-col gap-8 transition-transform md:translate-x-0 ${menuAbierto ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-start justify-between gap-2 px-2">
          <div className="flex flex-col gap-2">
            <img src={logoBlanco} alt="La Ollita" className="h-[34px] w-auto self-start" />
            <span className="text-[15px] font-semibold text-bosque-suave tracking-[0.04em]">Administración</span>
          </div>
          <button type="button" className="md:hidden text-bosque-suave p-1" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const activo = seccion === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => irSeccion(n.key)}
                className={`min-h-14 px-4 gap-3.5 flex items-center rounded-[14px] text-left text-[17px] font-semibold transition-colors ${
                  activo ? "bg-[rgba(162,217,242,0.16)] text-white" : "text-bosque-suave hover:bg-white/5"
                }`}
              >
                <Icon size={22} strokeWidth={activo ? 2.25 : 2} />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="border-t border-[rgba(162,217,242,0.25)] pt-4 flex flex-col gap-3 px-1">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-full bg-[#20A5E0] text-white grid place-items-center text-base font-bold shrink-0">NF</div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-base font-semibold text-white truncate">Equipo NOS</span>
              <span className="text-sm text-bosque-suave">Administrador</span>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarSesion}
            className="min-h-12 px-3 gap-2.5 inline-flex items-center rounded-[14px] text-[#A2D9F2] text-[16px] font-semibold hover:text-white hover:bg-white/5"
          >
            <LogOut size={20} strokeWidth={1.75} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {menuAbierto && (
        <div className="fixed inset-0 bg-bosque/55 z-40 md:hidden" onClick={() => setMenuAbierto(false)} />
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col md:ml-[280px]">
        <header className="bg-white border-b border-[#E0E0E0] px-4 sm:px-9 py-5 flex items-end justify-between gap-4 flex-wrap sticky top-0 z-30">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="size-11 grid place-items-center rounded-full bg-[#F0F0F0] text-bosque md:hidden shrink-0"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
            <div className="flex flex-col gap-0.5 min-w-0">
              <h1 className="text-[28px] font-bold text-bosque tracking-[-0.02em] leading-tight">{meta.titulo}</h1>
              <p className="text-base text-[#718096]">
                {meta.sub(totales, conteoGestores, diasActividad)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {hayCta && (
              <button
                type="button"
                onClick={() => {
                  if (seccion === "usuarios") setMostrarNuevoUsuario(true);
                  else irSeccion("nueva");
                }}
                className="min-h-[52px] px-6 rounded-full bg-[#0F7BA8] text-white text-base font-semibold inline-flex items-center gap-2 shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
              >
                <Plus size={20} /> {ctaLabel}
              </button>
            )}
            <button
              type="button"
              onClick={cerrarSesion}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="size-12 rounded-full border border-[#E0E0E0] bg-white text-[#475569] grid place-items-center shrink-0 hover:border-[#0F7BA8]"
            >
              <LogOut size={24} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-9 py-7 pb-14 flex flex-col gap-6">
          {seccion === "ollas" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Kpi icon={Utensils} valor={totales.comedores} label="Ollas y comedores" />
                <Kpi icon={Power} valor={totales.activos} label="Activos hoy" />
                <Kpi icon={Users} valor={totales.socias} label="Socias con acceso" />
                <Kpi icon={ClipboardList} valor={totales.beneficiarios} label="Beneficiarios en padrón" />
              </div>

              <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
                <Search size={20} className="text-[#718096] shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre o distrito"
                  className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {lista.map((f) => (
                  <article key={f.id} className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-hidden flex flex-col relative">
                    <div className={`h-1.5 ${f.activo ? "bg-[#20A5E0]" : "bg-[#E0E0E0]"}`} />
                    <div className="px-[22px] pt-5 pb-[18px] flex flex-col gap-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <span className={`inline-flex items-center gap-2 text-[15px] font-bold px-3.5 py-1.5 rounded-full ${
                          f.activo ? "bg-terracota-suave text-[#0A5F82]" : "bg-[#F0F0F0] text-[#718096]"
                        }`}>
                          <span className={`size-2 rounded-full ${f.activo ? "bg-[#20A5E0]" : "bg-[#9197B3]"}`} />
                          {f.activo ? "Activo" : "Inactivo"}
                        </span>
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Más opciones"
                            onClick={() => setMenuCard(menuCard === f.id ? null : f.id)}
                            className="size-11 -mt-2 -mr-2 rounded-full text-[#718096] hover:bg-[#F0F0F0] grid place-items-center"
                          >
                            <MoreVertical size={20} />
                          </button>
                          {menuCard === f.id && (
                            <div className="absolute top-12 right-0 w-[230px] bg-white border border-[#E0E0E0] rounded-[14px] p-2 flex flex-col gap-0.5 shadow-[0_8px_24px_rgba(7,34,73,0.18)] z-10">
                              <MenuItem icon={Pencil} label="Editar datos" onClick={() => { setMenuCard(null); setEditando(f); }} />
                              <MenuItem icon={Link2} label="Invitar a una socia" onClick={() => { setMenuCard(null); setInvitando(f); }} />
                              <MenuItem
                                icon={Power}
                                label={f.activo ? "Desactivar" : "Reactivar"}
                                onClick={async () => {
                                  setMenuCard(null);
                                  await fnActivar({ data: { comedor_id: f.id, activo: !f.activo } });
                                  cargar();
                                }}
                              />
                              <span className="h-px bg-[#F0F0F0] mx-2 my-1" />
                              <MenuItem
                                icon={Trash2}
                                label="Eliminar"
                                danger
                                onClick={() => {
                                  setMenuCard(null);
                                  setConfirmacion({
                                    titulo: `¿Eliminar ${f.nombre}?`,
                                    texto: "Se borran su padrón, su caja y su historial de menús. Esta acción no se puede deshacer.",
                                    onConfirm: async () => {
                                      await fnEliminar({ data: { comedor_id: f.id } });
                                      await cargar();
                                    },
                                  });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[22px] font-bold tracking-[-0.01em] leading-tight">{f.nombre}</span>
                        <span className="text-base text-[#718096]">{tipoLabel(f.tipo)} · {f.distrito}</span>
                      </div>
                    </div>
                    <div className="border-t border-[#F0F0F0] px-[22px] py-[18px] flex flex-col gap-3">
                      <DatoFila label="Reservas registradas" valor={`${f.reservas} ${f.reservas === 1 ? "reserva" : "reservas"}`} />
                      <DatoFila label="Socias · padrón" valor={`${f.socias} · ${f.beneficiarios}`} />
                      <DatoFila label="Dirección" valor={f.direccion || "—"} />
                      <button
                        type="button"
                        onClick={() => {
                          window.localStorage.setItem("admin_comedor_id", f.id);
                          window.location.href = "/panel";
                        }}
                        className={`min-h-[58px] mt-1.5 gap-2.5 flex items-center justify-center rounded-xl text-lg font-semibold border ${
                          f.activo
                            ? "border-[#0F7BA8] text-[#0F7BA8] bg-white hover:bg-terracota-suave"
                            : "border-[#E0E0E0] text-[#718096] bg-white"
                        }`}
                      >
                        Entrar al panel <ArrowRight size={20} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {lista.length === 0 && (
                <p className="text-center text-[#718096] py-10">No hay comedores que coincidan.</p>
              )}
            </div>
          )}

          {seccion === "nueva" && (
            <PanelNueva comedores={filas} recargar={cargar} verOllas={() => irSeccion("ollas")} />
          )}

          {seccion === "usuarios" && (
            <PanelUsuarios
              comedores={filas}
              mostrarNuevo={mostrarNuevoUsuario}
              setMostrarNuevo={setMostrarNuevoUsuario}
              onConteo={setConteoGestores}
              pedirConfirmacion={setConfirmacion}
            />
          )}

          {seccion === "actividad" && (
            <PanelActividad dias={diasActividad} setDias={setDiasActividad} />
          )}
        </main>
      </div>

      {invitando && <ModalInvitar comedor={invitando} cerrar={() => setInvitando(null)} />}
      {editando && <ModalEditar comedor={editando} cerrar={() => setEditando(null)} recargar={cargar} />}
      {confirmacion && (
        <ModalConfirmacion
          titulo={confirmacion.titulo}
          texto={confirmacion.texto}
          cerrar={() => setConfirmacion(null)}
          confirmar={async () => {
            try {
              await confirmacion.onConfirm();
              setConfirmacion(null);
            } catch (e: any) {
              alert(e?.message ?? "Error");
            }
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 px-3 gap-3 flex items-center rounded-[10px] text-left text-base font-semibold hover:bg-[#F0F0F0] ${
        danger ? "text-[#C5352B] hover:bg-[#FDECEA]" : "text-bosque"
      }`}
    >
      <Icon size={20} className={danger ? "" : "text-[#718096]"} />
      {label}
    </button>
  );
}

function DatoFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[17px] text-[#718096]">{label}</span>
      <span className="text-lg font-bold text-bosque text-right">{valor}</span>
    </div>
  );
}

function Kpi({ label, valor, icon: Icon }: { label: string; valor: number; icon: typeof Utensils }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-[18px] p-5 flex items-center gap-4">
      <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
        <Icon size={26} />
      </div>
      <div className="flex flex-col">
        <span className="text-[30px] font-bold tracking-[-0.02em] leading-none">{valor}</span>
        <span className="text-base text-[#718096] mt-1">{label}</span>
      </div>
    </div>
  );
}

function Campo({ label, className, ...rest }: any) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      <input {...rest} className={`h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] outline-none focus:border-[#0F7BA8] ${className ?? ""}`} />
    </label>
  );
}

function SelectCargo({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]">
        {CARGOS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
      </select>
    </label>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-[520px] max-h-full overflow-y-auto bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalConfirmacion({
  titulo, texto, cerrar, confirmar,
}: { titulo: string; texto: string; cerrar: () => void; confirmar: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-center justify-center p-4 sm:p-8" onClick={cerrar}>
      <div className="w-full max-w-[460px] bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]" onClick={(e) => e.stopPropagation()}>
        <div className="size-14 rounded-full bg-[#FDECEA] text-[#C5352B] grid place-items-center">
          <Trash2 size={28} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-2xl font-bold tracking-[-0.02em]">{titulo}</h3>
          <p className="text-[17px] text-[#475569]">{texto}</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] bg-white text-bosque text-[17px] font-semibold hover:border-[#9197B3]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await confirmar(); } finally { setBusy(false); } }}
            className="flex-1 min-h-14 rounded-full bg-[#C5352B] text-white text-[17px] font-semibold hover:bg-[#A82A22] disabled:opacity-60"
          >
            {busy ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ActFila = {
  id: string; nombre: string; distrito: string; activo: boolean;
  celdas: { menus: number; reservas: number; ingresos: number }[];
};

function PanelActividad({ dias, setDias }: { dias: number; setDias: (n: number) => void }) {
  const fn = useServerFn(adminActividadDiaria);
  const [data, setData] = useState<{ dias: string[]; filas: ActFila[] } | null>(null);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fn({ data: { dias } }).then((r: any) => setData(r)).finally(() => setCargando(false));
  }, [dias]);

  const filas = (data?.filas ?? []).filter((f) =>
    (f.nombre + " " + f.distrito).toLowerCase().includes(q.trim().toLowerCase()));

  const etiqueta = (f: string) => {
    const [, m, d] = f.split("-");
    return `${d}/${m}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-base text-[#475569]">
          Cada columna es un día. El check marca que publicó menú; el número, las reservas de ese día.
        </p>
        <div className="flex gap-1 bg-white border border-[#E0E0E0] rounded-full p-1">
          {[7, 14, 30].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDias(r)}
              className={`min-h-12 px-[18px] rounded-full text-base font-semibold ${
                dias === r ? "bg-terracota-suave text-bosque" : "text-[#718096]"
              }`}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
        <Search size={20} className="text-[#718096] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar olla o comedor"
          className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
        />
      </div>

      {cargando && !data ? (
        <p className="text-center text-[#718096] py-10">Cargando…</p>
      ) : (
        <div className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-bosque text-white">
                <th className="text-left px-6 py-4 sticky left-0 bg-bosque z-10 min-w-[200px] text-[15px] font-bold">Olla / comedor</th>
                {(data?.dias ?? []).map((d) => (
                  <th key={d} className="px-0 py-4 text-[15px] font-semibold text-bosque-suave text-center whitespace-nowrap w-[60px]">{etiqueta(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const conMenu = f.celdas.filter((c) => c.menus > 0).length;
                return (
                  <tr key={f.id} className="border-b border-[#F0F0F0]">
                    <td className="px-6 py-4 sticky left-0 bg-white z-10">
                      <p className="text-[17px] font-bold text-bosque truncate max-w-[240px]">{f.nombre}</p>
                      <p className="text-[15px] text-[#718096]">
                        {conMenu} de {f.celdas.length} días con menú
                      </p>
                    </td>
                    {f.celdas.map((c, i) => (
                      <td key={i} className="py-3.5 text-center align-middle">
                        {c.menus > 0 ? (
                          <Check size={22} className="mx-auto text-[#248341]" />
                        ) : (
                          <Minus size={22} className="mx-auto text-[#E0E0E0]" />
                        )}
                        <div className="text-sm text-[#718096] mt-0.5">{c.menus > 0 ? c.reservas : ""}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={(data?.dias.length ?? 0) + 1} className="text-center text-[#718096] py-10">Sin registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModalEditar({ comedor, cerrar, recargar }: { comedor: Fila; cerrar: () => void; recargar: () => void }) {
  const fn = useServerFn(adminActualizarComedor);
  const [v, setV] = useState({
    nombre: comedor.nombre,
    tipo: comedor.tipo,
    distrito: comedor.distrito,
    direccion: comedor.direccion,
    precio_menu: String(comedor.precio_menu ?? 0),
    raciones_diarias: String(comedor.raciones_diarias ?? 0),
    telefono_whatsapp: comedor.telefono_whatsapp ?? "",
    yape_numero: comedor.yape_numero ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const tipos = [
    { key: "comedor", label: "Comedor popular", sub: "Reconocido por el MIDIS" },
    { key: "olla", label: "Olla común", sub: "Autogestionada por el barrio" },
    { key: "restaurante", label: "Negocio de menú", sub: "Venta particular, sin apoyo del Estado" },
  ];

  return (
    <Overlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-2xl font-bold tracking-[-0.02em]">Datos de {comedor.nombre}</h3>
        <p className="text-base text-[#475569]">El precio del menú, las raciones y los pagos los maneja el comedor desde su panel.</p>
      </div>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setGuardando(true);
          try {
            await fn({
              data: {
                comedor_id: comedor.id,
                nombre: v.nombre,
                tipo: v.tipo,
                distrito: v.distrito,
                direccion: v.direccion,
                precio_menu: Number(v.precio_menu) || 0,
                raciones_diarias: Number(v.raciones_diarias) || 0,
                telefono_whatsapp: v.telefono_whatsapp,
                yape_numero: v.yape_numero,
              },
            });
            recargar();
            cerrar();
          } catch (e: any) {
            setErr(e?.message ?? "No se pudo guardar");
          } finally {
            setGuardando(false);
          }
        }}
      >
        <Campo label="Nombre" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} required />
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-bosque">Tipo</span>
          {tipos.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setV({ ...v, tipo: t.key })}
              className={`min-h-16 px-4 py-3 rounded-xl text-left flex flex-col gap-0.5 border ${
                v.tipo === t.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
              }`}
            >
              <span className="text-[17px] font-semibold">{t.label}</span>
              <span className="text-[15px] text-[#475569]">{t.sub}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Distrito" value={v.distrito} onChange={(e: any) => setV({ ...v, distrito: e.target.value })} />
          <Campo label="Dirección" value={v.direccion} onChange={(e: any) => setV({ ...v, direccion: e.target.value })} />
        </div>
        {err && <p className="text-[#C5352B] text-sm">{err}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] bg-white text-bosque text-[17px] font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function PanelNueva({ comedores, recargar, verOllas }: { comedores: Fila[]; recargar: () => void; verOllas: () => void }) {
  const fnCrear = useServerFn(adminCrearComedor);
  const fnInv = useServerFn(adminCrearInvitacion);
  const fnRegistro = useServerFn(adminCrearEnlaceRegistro);
  const [v, setV] = useState({ nombre: "", distrito: "", direccion: "", presidenta: "", dni: "", pin: "", telefono: "" });
  const [modo, setModo] = useState<"enlace" | "cuenta">("enlace");
  const [cargo, setCargo] = useState<string>("presidenta");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [creado, setCreado] = useState<string | null>(null);
  const [existente, setExistente] = useState("");
  const [enlace2, setEnlace2] = useState<string | null>(null);
  const [cargo2, setCargo2] = useState<string>("presidenta");
  const [enlaceRegistro, setEnlaceRegistro] = useState<string | null>(null);
  const [generandoReg, setGenerandoReg] = useState(false);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-5">
        <h3 className="text-[22px] font-bold">Nueva olla o comedor</h3>
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setGuardando(true);
            try {
              const r: any = await fnCrear({ data: { ...v, con_cuenta: modo === "cuenta" } });
              setCreado(r.nombre ?? v.nombre);
              recargar();
              if (modo === "enlace") {
                const inv: any = await fnInv({ data: { comedor_id: r.comedor_id, cargo: cargo as any } });
                setEnlace(`${window.location.origin}/invitacion/${inv.token}`);
              }
              setV({ nombre: "", distrito: "", direccion: "", presidenta: "", dni: "", pin: "", telefono: "" });
            } catch (e: any) {
              setErr(e?.message ?? "No se pudo crear");
            } finally {
              setGuardando(false);
            }
          }}
        >
          <Campo label="Nombre del comedor" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} placeholder="Ej. Comedor Santa Rosa" required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Distrito" value={v.distrito} onChange={(e: any) => setV({ ...v, distrito: e.target.value })} placeholder="Cercado de Lima" />
            <Campo label="Dirección" value={v.direccion} onChange={(e: any) => setV({ ...v, direccion: e.target.value })} placeholder="Av. Los Álamos 240" />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">¿Cómo entrará la presidenta?</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: "enlace" as const, label: "Con enlace de invitación", sub: "Ella crea su acceso" },
                { key: "cuenta" as const, label: "Crear su cuenta ahora", sub: "Tú defines su DNI y PIN" },
              ]).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setModo(m.key)}
                  className={`min-h-[76px] px-[18px] py-3.5 rounded-[14px] text-left flex flex-col gap-0.5 border ${
                    modo === m.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
                  }`}
                >
                  <span className="text-[17px] font-semibold">{m.label}</span>
                  <span className="text-[15px] opacity-80">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {modo === "enlace" ? (
            <SelectCargo value={cargo} onChange={setCargo} label="Cargo del enlace" />
          ) : (
            <>
              <Campo label="Nombre de la presidenta" value={v.presidenta} onChange={(e: any) => setV({ ...v, presidenta: e.target.value })} placeholder="Ej. María Quispe" required />
              <Campo label="DNI (será su usuario)" value={v.dni} onChange={(e: any) => setV({ ...v, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="12345678" required />
              <Campo label="PIN de acceso (4 a 8 números)" value={v.pin} onChange={(e: any) => setV({ ...v, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="1234" required />
              <Campo label="Celular · opcional" value={v.telefono} onChange={(e: any) => setV({ ...v, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })} placeholder="987654321" />
            </>
          )}

          {err && <p className="text-[#C5352B] text-sm">{err}</p>}
          <button
            type="submit"
            disabled={guardando}
            className="min-h-[58px] rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
          >
            {guardando ? "Creando…" : modo === "enlace" ? "Crear y sacar enlace" : "Crear comedor y cuenta"}
          </button>
        </form>

        {creado && !enlace && (
          <p className="text-[15px] text-bosque">
            Se creó “{creado}”.{" "}
            <button type="button" onClick={verOllas} className="underline text-[#0F7BA8] font-semibold">Ver la lista</button>
          </p>
        )}
        {enlace && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-bosque">Se creó “{creado}”. Comparte este enlace:</p>
            <EnlaceInvitacion enlace={enlace} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-bosque rounded-[20px] p-[26px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-xl font-bold text-white">Enlace para registrar una olla nueva</span>
            <span className="text-base text-bosque-suave">
              Envía este enlace por WhatsApp. La persona llena los datos de su olla o comedor, crea su acceso con DNI y PIN, y la olla se crea sola.
            </span>
          </div>
          {!enlaceRegistro ? (
            <button
              type="button"
              disabled={generandoReg}
              onClick={async () => {
                setGenerandoReg(true);
                try {
                  const inv: any = await fnRegistro({ data: {} });
                  setEnlaceRegistro(`${window.location.origin}/invitacion/${inv.token}`);
                } finally {
                  setGenerandoReg(false);
                }
              }}
              className="min-h-14 rounded-full bg-[#20A5E0] text-bosque text-[17px] font-bold hover:bg-[#43BDF0] disabled:opacity-60"
            >
              {generandoReg ? "Generando…" : "Generar enlace de registro"}
            </button>
          ) : (
            <div className="[&_p]:text-bosque-suave [&_a]:text-white [&_input]:bg-white">
              <EnlaceInvitacion enlace={enlaceRegistro} />
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold">Enlace para una olla ya creada</span>
            <span className="text-base text-[#475569]">Para sumar a otra socia a un comedor que ya existe.</span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Olla o comedor</span>
            <select
              value={existente}
              onChange={(e) => { setExistente(e.target.value); setEnlace2(null); }}
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
            >
              <option value="">Elige…</option>
              {comedores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <SelectCargo value={cargo2} onChange={(c) => { setCargo2(c); setEnlace2(null); }} label="Cargo que tendrá" />
          <button
            type="button"
            disabled={!existente}
            onClick={async () => {
              const inv: any = await fnInv({ data: { comedor_id: existente, cargo: cargo2 as any } });
              setEnlace2(`${window.location.origin}/invitacion/${inv.token}`);
            }}
            className="min-h-14 rounded-full border border-[#0F7BA8] bg-white text-[#0F7BA8] text-[17px] font-semibold hover:bg-terracota-suave disabled:opacity-50"
          >
            Generar enlace
          </button>
          {enlace2 && <EnlaceInvitacion enlace={enlace2} />}
        </div>
      </div>
    </div>
  );
}

type UsuarioFila = {
  id: string; user_id: string; nombre: string; cargo: string; email: string;
  telefono: string | null; comedor_id: string; comedor_nombre: string;
};

function iniciales(nombre: string) {
  return nombre.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PanelUsuarios({
  comedores, mostrarNuevo, setMostrarNuevo, onConteo, pedirConfirmacion,
}: {
  comedores: Fila[];
  mostrarNuevo: boolean;
  setMostrarNuevo: (v: boolean) => void;
  onConteo: (n: number) => void;
  pedirConfirmacion: (c: Confirmacion) => void;
}) {
  const fnListar = useServerFn(adminListarUsuarios);
  const fnCrear = useServerFn(adminCrearUsuario);
  const fnCargo = useServerFn(adminCambiarCargo);
  const fnEliminar = useServerFn(adminEliminarUsuario);
  const [filas, setFilas] = useState<UsuarioFila[]>([]);
  const [q, setQ] = useState("");
  const [v, setV] = useState({ comedor_id: "", nombre: "", cargo: "presidenta", dni: "", pin: "", telefono: "" });
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const cargar = () => {
    fnListar({}).then((r: any) => {
      setFilas(r);
      onConteo(r.length);
    });
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (mostrarNuevo) formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mostrarNuevo]);

  const lista = filas.filter((f) =>
    (f.nombre + " " + f.email + " " + f.comedor_nombre).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
        <Search size={20} className="text-[#718096] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o correo"
          className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
        />
      </div>

      {mostrarNuevo && (
        <form
          ref={formRef}
          className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-5 max-w-[560px]"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await fnCrear({ data: v });
              setV({ comedor_id: "", nombre: "", cargo: "presidenta", dni: "", pin: "", telefono: "" });
              setMostrarNuevo(false);
              cargar();
            } catch (e: any) {
              setErr(e?.message ?? "No se pudo crear");
            }
          }}
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-2xl font-bold tracking-[-0.02em]">Nuevo gestor</h3>
            <p className="text-base text-[#475569]">Crea una cuenta con DNI y PIN vinculada a una olla o comedor.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Olla o comedor</span>
            <select
              value={v.comedor_id}
              onChange={(e) => setV({ ...v, comedor_id: e.target.value })}
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
              required
            >
              <option value="">Elige…</option>
              {comedores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <Campo label="Nombre" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} required />
          <SelectCargo value={v.cargo} onChange={(c) => setV({ ...v, cargo: c })} label="Cargo" />
          <Campo label="DNI (será su usuario)" value={v.dni} onChange={(e: any) => setV({ ...v, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="PIN de acceso (4 a 8 números)" value={v.pin} onChange={(e: any) => setV({ ...v, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="Celular (opcional)" value={v.telefono} onChange={(e: any) => setV({ ...v, telefono: e.target.value })} />
          {err && <p className="text-[#C5352B] text-sm">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setMostrarNuevo(false)} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] text-bosque text-[17px] font-semibold">
              Cancelar
            </button>
            <button type="submit" className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)]">
              Crear cuenta
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(200px,1.6fr)_minmax(140px,1.6fr)_170px_minmax(150px,auto)] gap-4 px-6 py-4 bg-[#FCFCFC] border-b border-[#E0E0E0]">
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Persona</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Qué supervisa</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Rol</span>
            <span />
          </div>
          {lista.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[minmax(200px,1.6fr)_minmax(140px,1.6fr)_170px_minmax(150px,auto)] gap-4 px-6 py-[18px] border-b border-[#F0F0F0] items-center"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-full bg-terracota-suave text-bosque grid place-items-center text-base font-bold shrink-0">
                  {iniciales(u.nombre)}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-lg font-bold truncate">{u.nombre}</span>
                  <span className="text-[15px] text-[#718096] truncate">{u.email}</span>
                </div>
              </div>
              <span className="text-[17px] text-[#475569] truncate">{u.comedor_nombre}</span>
              <select
                value={u.cargo}
                onChange={async (e) => {
                  await fnCargo({ data: { vinculo_id: u.id, cargo: e.target.value } });
                  cargar();
                }}
                className="text-[15px] font-bold px-3.5 py-2 rounded-full border-0 bg-terracota-suave text-[#0A5F82] outline-none capitalize"
              >
                {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                type="button"
                onClick={() => {
                  pedirConfirmacion({
                    titulo: `¿Quitar el acceso de ${u.nombre}?`,
                    texto: "Perderá el acceso al panel de su olla. La olla no se modifica.",
                    onConfirm: async () => {
                      await fnEliminar({ data: { vinculo_id: u.id, borrar_cuenta: true } });
                      cargar();
                    },
                  });
                }}
                className="min-h-11 px-4 rounded-full bg-[#FDECEA] text-[#C5352B] text-[15px] font-semibold inline-flex items-center gap-1.5 justify-center hover:bg-[#F9D8D4] whitespace-nowrap"
              >
                <Trash2 size={18} /> Eliminar
              </button>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="text-center text-[#718096] py-10">Aún no hay gestores.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalInvitar({ comedor, cerrar }: { comedor: { id: string; nombre: string }; cerrar: () => void }) {
  const fn = useServerFn(adminCrearInvitacion);
  const [cargo, setCargo] = useState<string>("presidenta");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Overlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-2xl font-bold tracking-[-0.02em]">Invitar a {comedor.nombre}</h3>
        <p className="text-base text-[#475569]">Genera un enlace para que una socia cree su acceso con el cargo que elijas.</p>
      </div>
      <SelectCargo value={cargo} onChange={(c) => { setCargo(c); setEnlace(null); }} label="Cargo que tendrá" />
      {!enlace && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setErr(null);
            setBusy(true);
            try {
              const inv: any = await fn({ data: { comedor_id: comedor.id, cargo: cargo as any } });
              setEnlace(`${window.location.origin}/invitacion/${inv.token}`);
            } catch (e: any) {
              setErr(e?.message ?? "No se pudo generar");
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
        >
          {busy ? "Generando…" : "Generar enlace"}
        </button>
      )}
      {enlace && <EnlaceInvitacion enlace={enlace} />}
      {err && <p className="text-[#C5352B] text-sm">{err}</p>}
      <button type="button" onClick={cerrar} className="min-h-12 rounded-full border border-[#E0E0E0] text-bosque text-base font-semibold">
        Cerrar
      </button>
    </Overlay>
  );
}
