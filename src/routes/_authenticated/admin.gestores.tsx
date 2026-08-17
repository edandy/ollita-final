import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PanelUsuarios } from "@/components/admin/panels";
import { useAdminLayout } from "@/lib/admin-layout-context";

export const Route = createFileRoute("/_authenticated/admin/gestores")({
  head: () => ({ meta: [{ title: "Gestores — La Ollita" }] }),
  validateSearch: (search: Record<string, unknown>): { nuevo?: boolean } => ({
    nuevo: search.nuevo === true || search.nuevo === "true" || search.nuevo === "1" ? true : undefined,
  }),
  component: GestoresPage,
});

function GestoresPage() {
  const { nuevo } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/gestores" });
  const { kitchens, confirm, setSubtitleCount } = useAdminLayout();
  return (
    <PanelUsuarios
      comedores={kitchens}
      mostrarNuevo={!!nuevo}
      setMostrarNuevo={(open) => navigate({ search: open ? { nuevo: true } : {} })}
      onConteo={setSubtitleCount}
      pedirConfirmacion={confirm}
    />
  );
}
