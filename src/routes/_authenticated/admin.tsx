import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListarComedores } from "@/lib/admin.functions";
import { getPlatformAccess } from "@/lib/supervisor.functions";
import {
  adminSectionFromPath,
  adminSectionPath,
  canOpenAdminSection,
  type AccessLevel,
  type AdminSection,
} from "@/lib/access";
import {
  AdminLayoutContext,
  type AdminConfirm,
  type KitchenRow,
} from "@/lib/admin-layout-context";
import { kitchenTotals, ModalConfirmacion } from "@/components/admin/panels";
import { notifyError } from "@/lib/notify";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import logoBlanco from "@/assets/logo-ollita-blanco.svg";
import {
  Plus, Menu, X, LayoutGrid, Users, UserCog, CalendarCheck, LogOut,
} from "lucide-react";

const NAV: { key: AdminSection; label: string; icon: typeof LayoutGrid }[] = [
  { key: "ollas", label: "Ollas y comedores", icon: LayoutGrid },
  { key: "nueva", label: "Nueva olla y enlace", icon: Plus },
  { key: "gestores", label: "Gestores", icon: Users },
  { key: "usuarios", label: "Usuarios", icon: UserCog },
  { key: "actividad", label: "Uso diario", icon: CalendarCheck },
];

const TITULOS: Record<AdminSection, { titulo: string; sub: (t: ReturnType<typeof kitchenTotals>, n?: number, dias?: number) => string }> = {
  ollas: {
    titulo: "Ollas y comedores",
    sub: (t) => `${t.comedores} registrados · ${t.activos} activos`,
  },
  nueva: {
    titulo: "Nueva olla y enlace",
    sub: () => "Crea la olla o manda el enlace para que se registre sola",
  },
  gestores: {
    titulo: "Gestores",
    sub: (_t, n = 0) => `${n} gestores con acceso a ollas`,
  },
  usuarios: {
    titulo: "Usuarios",
    sub: (_t, n = 0) => `${n} usuarios de plataforma`,
  },
  actividad: {
    titulo: "Uso diario",
    sub: (_t, _n, dias = 14) => `Últimos ${dias} días`,
  },
};

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administración — La Ollita" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = adminSectionFromPath(pathname) ?? "ollas";
  const fnAccess = useServerFn(getPlatformAccess);
  const fnListar = useServerFn(adminListarComedores);
  const [ok, setOk] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [accessLevel, setAccessLevel] = useState<AccessLevel | null>(null);
  const [kitchens, setKitchens] = useState<KitchenRow[]>([]);
  const [confirmacion, setConfirmacion] = useState<AdminConfirm | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [subtitleCount, setSubtitleCount] = useState(0);
  const [activityDays, setActivityDays] = useState(14);

  const reloadKitchens = async () => {
    const r = await fnListar({});
    setKitchens(r as KitchenRow[]);
  };

  useEffect(() => {
    fnAccess({})
      .then(async (r: any) => {
        const admin = !!r.admin;
        const supervisor = !!r.supervisor;
        setIsAdmin(admin);
        setIsSupervisor(supervisor);
        setAccessLevel(r.accessLevel ?? null);
        setOk(admin || supervisor);
        if (admin || supervisor) {
          try { await reloadKitchens(); } catch (e) { console.error("No se pudo cargar el panel admin:", e); }
        }
      })
      .catch((e) => {
        console.error("Error verificando acceso:", e);
        setOk(false);
      });
  }, []);

  useEffect(() => {
    if (ok !== true) return;
    if (!canOpenAdminSection({ isAdmin, isSupervisor, section })) {
      navigate({ to: "/admin" });
    }
  }, [ok, isAdmin, isSupervisor, section, navigate]);

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

  const totales = kitchenTotals(kitchens);
  const meta = TITULOS[section];
  const navItems = NAV.filter((n) => canOpenAdminSection({ isAdmin, isSupervisor, section: n.key }));
  const cta =
    isAdmin && section === "ollas" ? { to: "/admin/nueva" as const, label: "Nueva olla", search: undefined }
    : isAdmin && section === "gestores" ? { to: "/admin/gestores" as const, label: "Nuevo gestor", search: { nuevo: true } }
    : isAdmin && section === "usuarios" ? { to: "/admin/usuarios" as const, label: "Nuevo usuario", search: { nuevo: true } }
    : null;

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <AdminLayoutContext.Provider
      value={{
        isAdmin,
        isSupervisor,
        accessLevel,
        kitchens,
        reloadKitchens,
        confirm: setConfirmacion,
        setSubtitleCount,
        setActivityDays,
      }}
    >
      <div className="min-h-screen flex bg-[#F0F0F0] text-bosque">
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
            {navItems.map((n) => {
              const Icon = n.icon;
              const activo = section === n.key;
              return (
                <Link
                  key={n.key}
                  to={adminSectionPath(n.key)}
                  onClick={() => setMenuAbierto(false)}
                  className={`min-h-14 px-4 gap-3.5 flex items-center rounded-[14px] text-left text-[17px] font-semibold transition-colors ${
                    activo ? "bg-[rgba(162,217,242,0.16)] text-white" : "text-bosque-suave hover:bg-white/5"
                  }`}
                >
                  <Icon size={22} strokeWidth={activo ? 2.25 : 2} />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="border-t border-[rgba(162,217,242,0.25)] pt-4 flex flex-col gap-3 px-1">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-full bg-[#20A5E0] text-white grid place-items-center text-base font-bold shrink-0">NF</div>
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-base font-semibold text-white truncate">{isAdmin ? "Equipo NOS" : "Supervisor"}</span>
                <span className="text-sm text-bosque-suave">{isAdmin ? "Administrador" : accessLevel === "full" ? "Acceso completo" : "Solo lectura"}</span>
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
                  {meta.sub(totales, subtitleCount, activityDays)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {cta && (
                <Link
                  to={cta.to}
                  search={cta.search}
                  className="min-h-[52px] px-6 rounded-full bg-[#0F7BA8] text-white text-base font-semibold inline-flex items-center gap-2 shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
                >
                  <Plus size={20} /> {cta.label}
                </Link>
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
            {canOpenAdminSection({ isAdmin, isSupervisor, section }) ? <Outlet /> : null}
          </main>
        </div>

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
                void notifyError(friendlySupabaseError(e?.message ?? "No pudimos completar la acción."));
              }
            }}
          />
        )}
      </div>
    </AdminLayoutContext.Provider>
  );
}
