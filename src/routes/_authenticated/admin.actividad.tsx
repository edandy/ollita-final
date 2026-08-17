import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PanelActividad } from "@/components/admin/panels";
import { useAdminLayout } from "@/lib/admin-layout-context";

export const Route = createFileRoute("/_authenticated/admin/actividad")({
  head: () => ({ meta: [{ title: "Uso diario — La Ollita" }] }),
  component: ActividadPage,
});

function ActividadPage() {
  const { setActivityDays } = useAdminLayout();
  const [dias, setDias] = useState(14);

  useEffect(() => {
    setActivityDays(dias);
  }, [dias, setActivityDays]);

  return <PanelActividad dias={dias} setDias={setDias} />;
}
