export const G1_DEMO_PIN = "1234";

export const G1_DEMO_KITCHEN_KEYS = ["carmen", "cristo", "santa", "flores", "villa"] as const;
export type G1DemoKitchenKey = (typeof G1_DEMO_KITCHEN_KEYS)[number];

/** DNIs already used by demo supervisors, padrón and walk-in reservations. */
export const G1_DEMO_RESERVED_DNIS = [
  "88880001",
  "88880002",
  "88881111",
  "88881112",
  "88881113",
  "88881114",
  "88881115",
  "88881116",
  "88882100",
  "88882101",
  "88882102",
] as const;

export const G1_DEMO_KITCHEN_STAFF: {
  kitchenKey: G1DemoKitchenKey;
  nombre: string;
  dni: string;
  telefono: string;
  cargo: "presidenta";
}[] = [
  { kitchenKey: "carmen", nombre: "Carmen Quispe", dni: "88883101", telefono: "999888101", cargo: "presidenta" },
  { kitchenKey: "cristo", nombre: "Reyna Torres", dni: "88883102", telefono: "999888102", cargo: "presidenta" },
  { kitchenKey: "santa", nombre: "María Santos", dni: "88883103", telefono: "999888103", cargo: "presidenta" },
  { kitchenKey: "flores", nombre: "Flor Paredes", dni: "88883104", telefono: "999888104", cargo: "presidenta" },
  { kitchenKey: "villa", nombre: "Hilda Villa", dni: "88883105", telefono: "999888105", cargo: "presidenta" },
];
