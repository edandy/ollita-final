import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar, Users, Store, LogOut, Package, UserCog, ShieldCheck, Utensils, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useMiComedor } from "@/lib/useMiComedor";
import { puede, type Cargo, type Accion } from "@/lib/permisos";
import { soyAdmin } from "@/lib/admin.functions";
import { PanelShell, PanelTitle, PanelIconBox, PanelCta } from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/mas")({
  head: () => ({ meta: [{ title: "Más — La Ollita" }] }),
  component: MasPage,
});

function MasPage() {
  const navigate = useNavigate();
  const { vinculo } = useMiComedor();
  const cargo = vinculo?.cargo as Cargo | undefined;
  const fnAdmin = useServerFn(soyAdmin);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    fnAdmin({}).then((r: any) => setAdmin(!!r.admin)).catch(() => setAdmin(false));
  }, []);
  const cerrar = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const items: { to: any; icon: any; label: string; desc: string; key: Accion }[] = (
    [
      { to: "/panel/menu", icon: Utensils, label: "Menús de la semana", desc: "Publica y programa los platos", key: "menu" as Accion },
      { to: "/panel/cronograma", icon: Calendar, label: "Cronograma de turnos", desc: "Quién cocina cada día", key: "cronograma" as Accion },
      { to: "/panel/insumos", icon: Package, label: "Almacén", desc: "Insumos, stock y plan de compra", key: "insumos" as Accion },
      { to: "/panel/padron", icon: Users, label: "Padrón", desc: "Beneficiarios y registro de entregas", key: "padron" as Accion },
      { to: "/panel/personal", icon: UserCog, label: "Personal del comedor", desc: "Cuentas y cargos del equipo", key: "personal" as Accion },
      { to: "/panel/perfil", icon: Store, label: "Perfil del comedor", desc: "Datos públicos, horario y Yape", key: "perfil" as Accion },
    ] as const
  ).filter((i) => puede(cargo, i.key));

  return (
    <PanelShell>
      <PanelTitle title="Más opciones" subtitle="Todo lo demás del comedor" />

      <div className="flex flex-col gap-3">
        {admin && (
          <Link
            to="/admin"
            className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-4 hover:border-[#0F7BA8]"
          >
            <div className="size-[52px] rounded-[14px] bg-bosque text-white grid place-items-center shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[19px] font-bold">Administración general</span>
              <span className="text-base text-[#718096] truncate">Todas las ollas y comedores</span>
            </div>
            <ChevronRight size={24} className="text-[#9197B3] shrink-0" />
          </Link>
        )}

        {items.map((i) => {
          const Icon = i.icon;
          return (
            <Link
              key={i.label}
              to={i.to}
              className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-4 hover:border-[#0F7BA8]"
            >
              <PanelIconBox icon={Icon} />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[19px] font-bold">{i.label}</span>
                <span className="text-base text-[#718096] truncate">{i.desc}</span>
              </div>
              <ChevronRight size={24} className="text-[#9197B3] shrink-0" />
            </Link>
          );
        })}
      </div>

      <div className="flex justify-center pt-2">
        <PanelCta variant="ghost" onClick={cerrar} className="min-h-14">
          <LogOut size={20} /> Cerrar sesión
        </PanelCta>
      </div>
    </PanelShell>
  );
}
