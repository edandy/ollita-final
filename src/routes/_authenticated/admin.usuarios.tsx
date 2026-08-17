import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PanelPlatformUsers } from "@/components/admin/panels";
import { useAdminLayout } from "@/lib/admin-layout-context";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuarios — La Ollita" }] }),
  validateSearch: (search: Record<string, unknown>): { nuevo?: boolean } => ({
    nuevo: search.nuevo === true || search.nuevo === "true" || search.nuevo === "1" ? true : undefined,
  }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const { nuevo } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/usuarios" });
  const { kitchens, confirm, setSubtitleCount } = useAdminLayout();
  return (
    <PanelPlatformUsers
      comedores={kitchens}
      mostrarNuevo={!!nuevo}
      setMostrarNuevo={(open) => navigate({ search: open ? { nuevo: true } : {} })}
      onConteo={setSubtitleCount}
      pedirConfirmacion={confirm}
    />
  );
}
