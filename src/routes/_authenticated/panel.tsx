import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Home, Wallet, ClipboardList, Menu as MenuIcon, LogOut } from "lucide-react";
import { useMiComedor } from "@/lib/useMiComedor";
import { puede, type Accion, type Cargo } from "@/lib/permisos";
import { SUPERVISOR_KITCHEN_STORAGE_KEY, ADMIN_KITCHEN_STORAGE_KEY } from "@/lib/access";
import { KitchenAccessContext } from "@/lib/kitchen-access-context";
import logoColor from "@/assets/logo-ollita.svg";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — La Ollita" }] }),
  component: PanelLayout,
});

function PanelLayout() {
  const navigate = useNavigate();
  const { vinculo, comedor, loading, platformRole } = useMiComedor();
  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  const salirDeAdmin = () => {
    window.localStorage.removeItem(ADMIN_KITCHEN_STORAGE_KEY);
    window.location.href = "/admin";
  };
  const salirDeSupervisor = () => {
    window.localStorage.removeItem(SUPERVISOR_KITCHEN_STORAGE_KEY);
    window.location.href = "/admin";
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-[#718096] bg-[#F0F0F0]">Cargando tu comedor…</div>;
  }

  if (platformRole === "supervisor" && (!vinculo || !comedor)) {
    if (typeof window !== "undefined") window.location.href = "/admin";
    return <div className="min-h-screen grid place-items-center text-[#718096] bg-[#F0F0F0]">Volviendo a tus ollas…</div>;
  }

  if (platformRole === "admin" && (!vinculo || !comedor)) {
    if (typeof window !== "undefined") window.location.href = "/admin";
    return <div className="min-h-screen grid place-items-center text-[#718096] bg-[#F0F0F0]">Volviendo a administración…</div>;
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-[#718096] bg-[#F0F0F0]">Cargando tu comedor…</div>;
  }

  if (!vinculo || !comedor) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto space-y-4 text-center bg-[#F0F0F0]">
        <h2 className="text-2xl text-bosque font-bold">No estás vinculada a un comedor</h2>
        <p className="text-[#718096]">
          Pídele a la presidenta de tu comedor que te agregue, o registra uno nuevo desde la pantalla de ingreso.
        </p>
        <button
          onClick={cerrarSesion}
          className="min-h-[58px] w-full rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)]"
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  const fechaTexto = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <KitchenAccessContext.Provider value={{ readOnly: !!vinculo.esSoloLectura }}>
    <div className="min-h-screen pb-[104px] bg-[#F0F0F0] text-bosque relative">
      {vinculo.esAdmin && (
        <div className="bg-bosque text-white px-4 py-2.5 text-xs flex items-center justify-between gap-3">
          <span className="truncate">Estás gestionando esta olla como administrador.</span>
          <button onClick={salirDeAdmin} className="shrink-0 underline font-semibold">
            Volver a Administración
          </button>
        </div>
      )}
      {vinculo.esSupervisor && (
        <div className="bg-bosque text-white px-4 py-2.5 text-xs flex items-center justify-between gap-3">
          <span className="truncate">
            {vinculo.esSoloLectura
              ? "Supervisando esta olla (solo lectura)."
              : "Supervisando esta olla con acceso completo."}
          </span>
          <button onClick={salirDeSupervisor} className="shrink-0 underline font-semibold">
            Volver a Administración
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white border-b border-[#E0E0E0]">
        <div className="max-w-[780px] mx-auto px-6 py-3 flex items-center gap-3.5">
          <div className="size-[46px] rounded-full bg-bosque text-white grid place-items-center text-lg font-bold shrink-0">
            {comedor.nombre.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-px">
            <span className="text-[13px] font-bold tracking-[0.06em] uppercase text-[#718096] truncate">
              {fechaTexto}
            </span>
            <span className="text-[19px] font-bold tracking-[-0.01em] text-bosque truncate">{comedor.nombre}</span>
          </div>
          <img src={logoColor} alt="La Ollita" className="h-[26px] w-auto shrink-0" />
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

      <Outlet />
      <BottomNav cargo={vinculo.cargo as Cargo} isSupervisor={!!vinculo.esSupervisor} />
    </div>
    </KitchenAccessContext.Provider>
  );
}

function BottomNav({ cargo, isSupervisor }: { cargo: Cargo; isSupervisor?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = (
    [
      { to: "/panel", label: "Inicio", icon: Home, exact: true, key: "hoy" as Accion },
      { to: "/panel/caja", label: "Caja", icon: Wallet, key: "caja" as Accion },
      { to: "/panel/reservas", label: "Reservas", icon: ClipboardList, key: "reservas" as Accion },
    ] as const
  ).filter((i) => puede(cargo, i.key, { isSupervisor }));

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-[12px] border-t border-[#E0E0E0]">
      <div className="max-w-[780px] mx-auto px-4 pt-2 pb-3.5 flex">
        {[...items, { to: "/panel/mas", label: "Más", icon: MenuIcon, exact: false } as const].map((i: any) => {
          const Icon = i.icon;
          const activo = i.exact ? path === i.to : path.startsWith(i.to);
          return (
            <Link
              key={i.to}
              to={i.to}
              className={`flex-1 min-h-[60px] gap-0.5 flex flex-col items-center justify-center font-semibold ${
                activo ? "text-[#0F7BA8]" : "text-[#475569]"
              }`}
            >
              <Icon size={28} strokeWidth={activo ? 2.25 : 1.75} />
              <span className="text-[14px] font-semibold">{i.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
