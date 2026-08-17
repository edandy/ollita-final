import { createFileRoute } from "@tanstack/react-router";
import { KitchensPanel } from "@/components/admin/panels";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Ollas y comedores — La Ollita" }] }),
  component: KitchensPanel,
});
