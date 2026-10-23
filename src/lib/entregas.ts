export const DELIVERY_SERVING_CAP = 6;

export type DeliveryPayMethod = "efectivo" | "yape" | "debe";

export const ENTREGAS_MSG = {
  noMenu: "Hoy no hay menú publicado.",
  noServings: "Ya no hay raciones para entregar.",
  cajaMissing: "No había caja de hoy. La abrimos con capital 0 para registrar el pago.",
  deliveryOk: "Listo, se entregó.",
  debtPaid: "Listo, ya pagó.",
  needName: "Escribe el nombre de la persona.",
} as const;

export function deliveryAmount(precio: number, servings: number) {
  const p = Number(precio);
  const s = Number(servings);
  if (!Number.isFinite(p) || !Number.isFinite(s) || p < 0 || s <= 0) return 0;
  return Math.round(p * s * 100) / 100;
}

export function maxServings({
  available,
  cap = DELIVERY_SERVING_CAP,
  kitchenMax,
}: {
  available: number;
  cap?: number;
  kitchenMax?: number | null;
}) {
  const leftover = Math.max(0, Math.floor(Number(available) || 0));
  const tapCap = Math.max(0, Math.floor(Number(cap) || 0));
  const kitchen =
    kitchenMax == null || kitchenMax === undefined
      ? tapCap
      : Math.max(0, Math.floor(Number(kitchenMax) || 0));
  return Math.min(leftover, tapCap, kitchen);
}

export function shouldPostCajaIncome(method: DeliveryPayMethod) {
  return method === "efectivo" || method === "yape";
}

export function shouldOpenDebt(method: DeliveryPayMethod) {
  return method === "debe";
}

export function deliveryBlockReason({
  hasMenu,
  available,
}: {
  hasMenu: boolean;
  available: number;
}) {
  if (!hasMenu) return ENTREGAS_MSG.noMenu;
  if (maxServings({ available }) <= 0) return ENTREGAS_MSG.noServings;
  return null;
}

export function walkInNameOk(name: string) {
  return name.trim().length >= 2;
}
