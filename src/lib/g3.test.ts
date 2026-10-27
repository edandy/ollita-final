import { describe, expect, it } from "vitest";
import {
  baselineRange,
  buildG3Report,
  dishKey,
  formatG3Money,
  formatG3Percent,
  isAnimalProtein,
  monthRange,
  shiftMonth,
  type G3Menu,
  type G3Reservation,
} from "./g3";
import type { G2Movement, G2Supply } from "./g2";

describe("months", () => {
  it("maps any day to its calendar month with a Peruvian label", () => {
    expect(monthRange("2026-09-17")).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "Setiembre 2026" });
    expect(monthRange("2026-02-03")).toEqual({ from: "2026-02-01", to: "2026-02-28", label: "Febrero 2026" });
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-01");
  });

  it("uses the three previous months as the baseline", () => {
    expect(baselineRange("2026-10-01")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
});

describe("dishes", () => {
  it("groups dish names regardless of case, accents and spaces", () => {
    expect(dishKey(" Ají de  Gallina")).toBe(dishKey("aji de gallina"));
  });

  it("detects animal protein from the dish name", () => {
    expect(isAnimalProtein("Arroz con pollo")).toBe(true);
    expect(isAnimalProtein("Ají de gallina")).toBe(true);
    expect(isAnimalProtein("Tortilla de huevo")).toBe(true);
    expect(isAnimalProtein("Sudado de JUREL")).toBe(true);
    expect(isAnimalProtein("Lentejas con arroz")).toBe(false);
    expect(isAnimalProtein("Tallarines rojos")).toBe(false);
    expect(isAnimalProtein("Arroz chaufa")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats cost per serving with cents and rates with one decimal", () => {
    expect(formatG3Money(1.575)).toBe("S/ 1.58");
    expect(formatG3Money(0.5)).toBe("S/ 0.50");
    expect(formatG3Percent(0.0523)).toBe("5.2%");
  });
});

function menu(id: string, comedor_id: string, fecha: string, nombre_plato: string, raciones: number): G3Menu {
  return { id, comedor_id, fecha, nombre_plato, publicado: true, raciones_disponibles: raciones };
}

function supply(over: Partial<G2Supply> & Pick<G2Supply, "id" | "comedor_id" | "nombre">): G2Supply {
  return { unidad: "kg", stock_actual: 0, precio_referencial: null, ...over };
}

function out(insumo_id: string, fecha: string, cantidad: number): G2Movement {
  return { insumo_id, tipo: "salida", cantidad, fecha, precio_unitario: null };
}

describe("buildG3Report", () => {
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen" },
    { id: "b", nombre: "Cristo Rey" },
    { id: "c", nombre: "Villa Hermosa" },
  ];
  const menus: G3Menu[] = [
    menu("a1", "a", "2026-10-01", "Arroz con pollo", 10),
    menu("a2", "a", "2026-10-02", "Arroz con pollo", 10),
    menu("a3", "a", "2026-10-05", "Lentejas", 10),
    menu("a0", "a", "2026-09-15", "Lentejas", 100),
    menu("b1", "b", "2026-10-01", "Tallarines", 50),
    menu("b2", "b", "2026-10-02", "Tallarines", 50),
    menu("b3", "b", "2026-10-03", "tallarines", 50),
    { ...menu("bx", "b", "2026-10-06", "Borrador", 80), publicado: false },
  ];
  const reservations: G3Reservation[] = ["a1", "a2", "a3"].map((menu_id) => ({
    menu_id,
    comedor_id: "a",
    cantidad: 90,
    estado: "recogida",
  }));
  const supplies: G2Supply[] = [
    supply({ id: "a-arroz", comedor_id: "a", nombre: "Arroz", precio_referencial: 4 }),
    supply({ id: "a-aceite", comedor_id: "a", nombre: "Aceite", unidad: "L", precio_referencial: 10 }),
    supply({ id: "a-leche", comedor_id: "a", nombre: "Leche", unidad: "unid", precio_referencial: 0 }),
    supply({ id: "b-arroz", comedor_id: "b", nombre: "arroz" }),
  ];
  const movements: G2Movement[] = [
    out("a-arroz", "2026-10-01", 10),
    out("a-arroz", "2026-10-02", 10),
    out("a-arroz", "2026-10-05", 12),
    out("a-arroz", "2026-09-15", 10),
    out("a-aceite", "2026-10-01", 1),
    out("a-aceite", "2026-10-02", 1),
    out("a-aceite", "2026-10-05", 1),
    out("a-aceite", "2026-09-15", 1.5),
    out("a-leche", "2026-10-01", 30),
    out("b-arroz", "2026-10-01", 5),
    out("b-arroz", "2026-10-02", 5),
    out("b-arroz", "2026-10-03", 5),
    { insumo_id: "b-arroz", tipo: "ingreso", cantidad: 20, fecha: "2026-09-20", precio_unitario: 5 },
  ];
  const report = buildG3Report({
    groupName: "VES Sur",
    monthStart: "2026-10-14",
    today: "2026-10-31",
    kitchens,
    menus,
    reservations,
    supplies,
    movements,
  });

  it("covers the month and only counts kitchens with servings and outflows", () => {
    expect(report.month.label).toBe("Octubre 2026");
    expect(report.month.until).toBeNull();
    expect(report.coverage).toEqual({ withData: 2, total: 3 });
    expect(report.prepared).toBe(450);
  });

  it("computes the food cost per serving for the group and its range", () => {
    // a: (32 kg × 4 + 3 L × 10 + 30 unid × 0) / 300; b: 15 kg × 5 (last purchase) / 150
    expect(report.cost.perServing).toBeCloseTo(233 / 450, 6);
    expect(report.cost.min).toBeCloseTo(0.5, 6);
    expect(report.cost.max).toBeCloseTo(158 / 300, 6);
    expect(report.kitchenCosts.map((k) => k.id)).toEqual(["a", "b"]);
  });

  it("measures merma against each kitchen's own past usage, counting only the excess", () => {
    // arroz expected 0.1 kg × 300 = 30 kg, used 32 → 2 kg × S/ 4 of excess; aceite used less → 0
    expect(report.merma).toBeCloseTo(8 / (120 + 45), 6);
  });

  it("does not count a loan to another kitchen as merma", () => {
    const r = buildG3Report({
      groupName: "VES Sur",
      monthStart: "2026-10-14",
      today: "2026-10-31",
      kitchens,
      menus,
      reservations,
      supplies,
      movements: [...movements, { ...out("a-arroz", "2026-10-02", 40), transfer_id: "t1" }],
    });
    expect(r.merma).toBeCloseTo(report.merma!, 6);
  });

  it("returns no merma without history", () => {
    const r = buildG3Report({
      groupName: "G",
      monthStart: "2026-10-01",
      today: "2026-10-31",
      kitchens,
      menus: menus.filter((m) => m.fecha >= "2026-10-01"),
      reservations,
      supplies,
      movements: movements.filter((m) => m.fecha >= "2026-10-01"),
    });
    expect(r.merma).toBeNull();
  });

  it("counts unserved servings and what they cost", () => {
    expect(report.unserved.servings).toBe(180);
    expect(report.unserved.rate).toBeCloseTo(0.4, 6);
    expect(report.unserved.cost).toBeCloseTo(180 * (233 / 450), 6);
  });

  it("averages distinct dishes per kitchen", () => {
    expect(report.dishes).toEqual({ average: 1.5, min: 1, max: 2 });
  });

  it("reports yield per serving in grams or milliliters, with the kitchen range", () => {
    expect(report.yields.map((y) => y.label)).toEqual(["Arroz", "Aceite"]);
    const arroz = report.yields[0];
    expect(arroz.unit).toBe("g");
    expect(arroz.group).toBeCloseTo(47000 / 450, 6);
    expect(arroz.min).toBeCloseTo(100, 6);
    expect(arroz.max).toBeCloseTo(32000 / 300, 6);
    expect(arroz.maxKitchen).toBe("Demo · Virgen del Carmen");
    expect(arroz.high).toBe(false);
    expect(report.yields[1]).toMatchObject({ unit: "ml", group: 10, min: 10, max: 10 });
  });

  it("flags a maximum 50% or more above the group", () => {
    const r = buildG3Report({
      groupName: "G",
      monthStart: "2026-10-01",
      today: "2026-10-31",
      kitchens,
      menus,
      reservations,
      supplies,
      movements: [...movements, out("b-arroz", "2026-10-03", 30)],
    });
    expect(r.yields[0].maxKitchen).toBe("Cristo Rey");
    expect(r.yields[0].high).toBe(true);
  });

  it("summarizes menu variety", () => {
    expect(report.variety.proteinRate).toBeCloseTo(2 / 6, 6);
    expect(report.variety.leastVaried).toEqual({ nombre: "Cristo Rey", dishes: 1 });
    expect(report.variety.repeatedKitchens).toBe(1);
    expect(report.variety.topDishes.map((d) => d.label)).toEqual(["Tallarines", "Arroz con pollo", "Lentejas"]);
    expect(report.variety.topDishes[0].rate).toBeCloseTo(0.5, 6);
  });

  it("stops a running month at today, ignoring menus already published for later days", () => {
    const r = buildG3Report({
      groupName: "G",
      monthStart: "2026-10-01",
      today: "2026-10-05",
      kitchens,
      menus: [...menus, menu("a9", "a", "2026-10-06", "Arroz con pollo", 100)],
      reservations,
      supplies,
      movements,
    });
    expect(r.month.until).toBe("2026-10-05");
    expect(r.prepared).toBe(450);
    expect(r.unserved.servings).toBe(180);
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG3Report({
      groupName: "Vacío",
      monthStart: "2026-10-01",
      today: "2026-10-31",
      kitchens: [],
      menus: [],
      reservations: [],
      supplies: [],
      movements: [],
    });
    expect(empty.coverage).toEqual({ withData: 0, total: 0 });
    expect(empty.cost.perServing).toBe(0);
    expect(empty.merma).toBeNull();
    expect(empty.yields).toEqual([]);
    expect(empty.variety.leastVaried).toBeNull();
  });
});
