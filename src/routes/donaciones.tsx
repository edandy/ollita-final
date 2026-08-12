import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/donaciones")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
