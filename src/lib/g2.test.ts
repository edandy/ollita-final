import { describe, expect, it } from "vitest";
import {
  G2_ALERT_DAYS,
  buildG2Report,
  coverageDays,
  dailyUsage,
  formatG2Days,
  formatG2Money,
  formatG2Quantity,
  g2Cutoff,
  g2CutoffLabel,
  stockAtCutoff,
  supplyKey,
  type G2Movement,
  type G2Supply,
} from "./g2";

describe("supplyKey", () => {
  it("groups the same supply across kitchens regardless of case, accents and spaces", () => {
    expect(supplyKey("  Azúcar ", "kg")).toBe(supplyKey("azucar", "kg"));
    expect(supplyKey("Leche  evaporada", "unid")).toBe(supplyKey("leche evaporada", "unid"));
  });

  it("keeps different units apart", () => {
    expect(supplyKey("Aceite", "L")).not.toBe(supplyKey("Aceite", "unid"));
  });
});

describe("stock and usage", () => {
  it("rebuilds the stock at the cutoff by undoing later movements", () => {
    expect(
      stockAtCutoff(50, "2026-10-24", [
        { tipo: "ingreso", cantidad: 20, fecha: "2026-10-26" },
        { tipo: "salida", cantidad: 5, fecha: "2026-10-27" },
        { tipo: "salida", cantidad: 99, fecha: "2026-10-24" },
      ]),
    ).toBe(35);
  });

  it("never returns negative stock", () => {
    expect(stockAtCutoff(0, "2026-10-24", [{ tipo: "ingreso", cantidad: 5, fecha: "2026-10-25" }])).toBe(0);
  });

  it("averages outflows over the days that had outflows, inside the 30-day window", () => {
    expect(
      dailyUsage("2026-10-24", [
        { tipo: "salida", cantidad: 10, fecha: "2026-10-24" },
        { tipo: "salida", cantidad: 6, fecha: "2026-10-24" },
        { tipo: "salida", cantidad: 8, fecha: "2026-10-20" },
        { tipo: "ingreso", cantidad: 50, fecha: "2026-10-20" },
        { tipo: "salida", cantidad: 100, fecha: "2026-09-20" },
        { tipo: "salida", cantidad: 100, fecha: "2026-10-25" },
      ]),
    ).toBe(12);
  });

  it("leaves loans to other kitchens out of the usage, but not out of the stock", () => {
    const moves = [
      { tipo: "salida", cantidad: 10, fecha: "2026-10-24" },
      { tipo: "salida", cantidad: 25, fecha: "2026-10-23", transfer_id: "t1" },
    ];
    expect(dailyUsage("2026-10-24", moves)).toBe(10);
    expect(stockAtCutoff(5, "2026-10-22", moves)).toBe(40);
  });

  it("returns 0 usage without outflows", () => {
    expect(dailyUsage("2026-10-24", [])).toBe(0);
  });

  it("counts whole days of coverage, or null when there is no usage to measure", () => {
    expect(coverageDays(48, 17)).toBe(2);
    expect(coverageDays(0, 5)).toBe(0);
    expect(coverageDays(10, 0)).toBeNull();
  });
});

describe("cutoff", () => {
  it("cuts at the end of the week, or today if the week is still running", () => {
    expect(g2Cutoff("2026-10-24", "2026-10-26")).toBe("2026-10-24");
    expect(g2Cutoff("2026-10-31", "2026-10-28")).toBe("2026-10-28");
  });

  it("labels the cutoff with the weekday", () => {
    expect(g2CutoffLabel("2026-10-23")).toBe("Vie 23/10/2026");
    expect(g2CutoffLabel("2026-10-24")).toBe("Sáb 24/10/2026");
    expect(g2CutoffLabel("2026-10-21")).toBe("Mié 21/10/2026");
  });
});

describe("formatting", () => {
  it("formats quantities with thin thousands and the unit", () => {
    expect(formatG2Quantity(720.4, "kg")).toBe("720 kg");
    expect(formatG2Quantity(1250, "L")).toBe("1 250 L");
    expect(formatG2Quantity(610, "unid")).toBe("610 unid");
  });

  it("formats money in soles without decimals", () => {
    expect(formatG2Money(24870.4)).toBe("S/ 24 870");
  });

  it("caps long coverages and dashes unknown ones", () => {
    expect(formatG2Days(8)).toBe("8");
    expect(formatG2Days(45)).toBe("30+");
    expect(formatG2Days(null)).toBe("—");
  });
});

function supply(over: Partial<G2Supply> & Pick<G2Supply, "id" | "comedor_id" | "nombre">): G2Supply {
  return { unidad: "kg", stock_actual: 0, precio_referencial: null, ...over };
}

function outflows(insumo_id: string, perDay: number, days: string[]): G2Movement[] {
  return days.map((fecha) => ({ insumo_id, tipo: "salida", cantidad: perDay, fecha, precio_unitario: null }));
}

const WEEK = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

describe("buildG2Report", () => {
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen" },
    { id: "b", nombre: "Cristo Rey" },
    { id: "c", nombre: "Villa Hermosa" },
  ];
  const supplies: G2Supply[] = [
    supply({ id: "a-arroz", comedor_id: "a", nombre: "Arroz", stock_actual: 80, precio_referencial: 4 }),
    supply({ id: "a-aceite", comedor_id: "a", nombre: "Aceite", unidad: "L", stock_actual: 6, precio_referencial: 10 }),
    supply({ id: "b-arroz", comedor_id: "b", nombre: "arroz ", stock_actual: 15 }),
    supply({ id: "b-azucar", comedor_id: "b", nombre: "Azúcar", stock_actual: 40, precio_referencial: 3 }),
    supply({ id: "c-arroz", comedor_id: "c", nombre: "Arroz", stock_actual: 500, precio_referencial: 4 }),
  ];
  const movements: G2Movement[] = [
    ...outflows("a-arroz", 10, WEEK),
    ...outflows("a-aceite", 2, WEEK),
    ...outflows("b-arroz", 10, WEEK),
    ...outflows("b-azucar", 2, WEEK),
    { insumo_id: "b-arroz", tipo: "ingreso", cantidad: 20, fecha: "2026-10-15", precio_unitario: 5 },
    { insumo_id: "a-arroz", tipo: "ingreso", cantidad: 30, fecha: "2026-10-26", precio_unitario: 4 },
  ];
  const report = buildG2Report({
    groupName: "VES Sur",
    weekStart: "2026-10-21",
    today: "2026-10-26",
    kitchens,
    supplies,
    movements,
  });

  it("cuts at Saturday and compares against the next cutoff", () => {
    expect(report.cutoff).toEqual({ date: "2026-10-24", label: "Sáb 24/10/2026" });
    expect(report.nextCutoff).toEqual({ date: "2026-10-31", label: "31/10" });
  });

  it("only counts kitchens with movements in the week", () => {
    expect(report.coverage).toEqual({ withData: 2, total: 3 });
    expect(report.kitchens.map((k) => [k.nombre, k.hasData])).toEqual([
      ["Cristo Rey", true],
      ["Demo · Virgen del Carmen", true],
      ["Villa Hermosa", false],
    ]);
  });

  it("values stock with the reference price, falling back to the last purchase price", () => {
    // a: arroz 50 (80 minus the later 30 entry) × 4 + aceite 6 × 10; b: arroz 15 × 5 + azúcar 40 × 3
    expect(report.totals.stockValue).toBe(200 + 60 + 75 + 120);
    expect(report.totals.catalogSize).toBe(3);
  });

  it("aggregates stock and usage per supply and counts kitchens under the alert threshold", () => {
    const arroz = report.supplies.find((s) => s.label === "Arroz")!;
    expect(arroz).toMatchObject({ unit: "kg", stock: 65, dailyUse: 20, inAlert: 1, runsOutBeforeNext: 2 });
    const aceite = report.supplies.find((s) => s.label === "Aceite")!;
    expect(aceite).toMatchObject({ stock: 6, dailyUse: 2, inAlert: 1, runsOutBeforeNext: 1 });
    const azucar = report.supplies.find((s) => s.label === "Azúcar")!;
    expect(azucar).toMatchObject({ inAlert: 0, runsOutBeforeNext: 0 });
    expect(report.supplies.map((s) => s.label)).toEqual(["Arroz", "Aceite", "Azúcar"]);
  });

  it("counts kitchens in alert and in critical state", () => {
    // a: aceite 3 days; b: arroz 1 day
    expect(report.totals.kitchensInAlert).toBe(2);
    expect(report.totals.kitchensCritical).toBe(1);
    expect(G2_ALERT_DAYS).toBe(4);
  });

  it("builds the coverage grid for the most used supplies", () => {
    expect(report.basics.map((b) => b.label)).toEqual(["Arroz", "Aceite", "Azúcar"]);
    expect(report.kitchens[0].days).toEqual([1, null, 20]);
    expect(report.kitchens[1].days).toEqual([5, 3, null]);
    expect(report.kitchens[2].days).toEqual([null, null, null]);
  });

  it("prefers supplies in alert over high-volume ones for the coverage grid", () => {
    const k = [{ id: "a", nombre: "A" }];
    const items: G2Supply[] = [
      supply({ id: "leche", comedor_id: "a", nombre: "Leche", unidad: "unid", stock_actual: 600 }),
      supply({ id: "arroz", comedor_id: "a", nombre: "Arroz", stock_actual: 500 }),
      supply({ id: "sal", comedor_id: "a", nombre: "Sal", stock_actual: 400 }),
      supply({ id: "fideos", comedor_id: "a", nombre: "Fideos", stock_actual: 300 }),
      supply({ id: "aceite", comedor_id: "a", nombre: "Aceite", unidad: "L", stock_actual: 2 }),
    ];
    const moves = [
      ...outflows("leche", 60, WEEK),
      ...outflows("arroz", 50, WEEK),
      ...outflows("sal", 40, WEEK),
      ...outflows("fideos", 30, WEEK),
      ...outflows("aceite", 1, WEEK),
    ];
    const r = buildG2Report({
      groupName: "G",
      weekStart: "2026-10-21",
      today: "2026-10-26",
      kitchens: k,
      supplies: items,
      movements: moves,
    });
    expect(r.basics[0].label).toBe("Aceite");
  });

  it("sums what each kitchen is missing for the next 10 days", () => {
    expect(report.shopping).toEqual([
      { key: supplyKey("Arroz", "kg"), label: "Arroz", unit: "kg", quantity: 135, kitchens: 2 },
      { key: supplyKey("Aceite", "L"), label: "Aceite", unit: "L", quantity: 14, kitchens: 1 },
    ]);
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG2Report({
      groupName: "Vacío",
      weekStart: "2026-10-21",
      today: "2026-10-26",
      kitchens: [],
      supplies: [],
      movements: [],
    });
    expect(empty.coverage).toEqual({ withData: 0, total: 0 });
    expect(empty.supplies).toEqual([]);
    expect(empty.shopping).toEqual([]);
  });
});
