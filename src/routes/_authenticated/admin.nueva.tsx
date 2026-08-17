import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PanelNueva } from "@/components/admin/panels";
import { useAdminLayout } from "@/lib/admin-layout-context";

export const Route = createFileRoute("/_authenticated/admin/nueva")({
  head: () => ({ meta: [{ title: "Nueva olla — La Ollita" }] }),
  component: NuevaPage,
});

function NuevaPage() {
  const navigate = useNavigate();
  const { kitchens, reloadKitchens } = useAdminLayout();
  return (
    <PanelNueva
      comedores={kitchens}
      recargar={reloadKitchens}
      verOllas={() => navigate({ to: "/admin" })}
    />
  );
}
