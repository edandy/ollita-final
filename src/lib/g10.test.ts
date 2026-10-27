import { describe, expect, it } from "vitest";
import { buildG10Report, roundLoan, type G10Movement } from "./g10";

describe("roundLoan", () => {
  it("rounds down to 5 from 10 up and to units below", () => {
    expect(roundLoan(43.2)).toBe(40);
    expect(roundLoan(10)).toBe(10);
    expect(roundLoan(7.9)).toBe(7);
    expect(roundLoan(0.6)).toBe(0);
  });
});

describe("buildG10Report", () => {
  const cutoff = "2026-10-22";
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen", raciones_diarias: 100 },
    { id: "b", nombre: "San Martín", raciones_diarias: 80 },
    { id: "c", nombre: "Cristo Rey", raciones_diarias: 70 },
    { id: "d", nombre: "Las Lomas", raciones_diarias: 60 },
    { id: "e", nombre: "Sagrado Corazón", raciones_diarias: 50 },
    { id: "f", nombre: "Villa Hermosa", raciones_diarias: 40 },
  ];
  const supply = (id: string, comedor_id: string, nombre: string, unidad: string, stock_actual: number) => ({
    id,
    comedor_id,
    nombre,
    unidad,
    stock_actual,
  });
  const supplies = [
    supply("a-arroz", "a", "Arroz", "kg", 120),
    supply("b-arroz", "b", "arroz", "kg", 20),
    supply("c-arroz", "c", "Arroz", "kg", 30),
    supply("e-arroz", "e", "Arroz", "kg", 90),
    supply("a-aceite", "a", "Aceite", "L", 15),
    supply("b-aceite", "b", "Aceite", "L", 3),
    supply("c-aceite", "c", "Aceite", "L", 1.5),
    // Only one kitchen uses it: nothing to compare.
    supply("d-leche", "d", "Leche evaporada", "unid", 2),
    // Nobody is short of it.
    supply("a-fideos", "a", "Fideos", "kg", 50),
    supply("b-fideos", "b", "Fideos", "kg", 30),
  ];
  const use = (insumo_id: string, cantidad: number): G10Movement => ({
    insumo_id,
    tipo: "salida",
    cantidad,
    fecha: cutoff,
    transfer_id: null,
  });
  const movements: G10Movement[] = [
    use("a-arroz", 10),
    use("b-arroz", 10),
    use("c-arroz", 10),
    use("e-arroz", 10),
    use("a-aceite", 1.5),
    use("b-aceite", 1.5),
    use("c-aceite", 1.5),
    use("d-leche", 6),
    use("a-fideos", 5),
    use("b-fideos", 5),
    // A loan out of a: moves stock, not usage.
    { insumo_id: "a-arroz", tipo: "salida", cantidad: 25, fecha: cutoff, transfer_id: "t0" },
  ];
  const transfers = [
    { from_comedor_id: "e", to_comedor_id: "c", supply_name: "Arroz", unit: "kg", quantity: 25, sent_on: "2026-10-14", status: "received" },
    { from_comedor_id: "a", to_comedor_id: "b", supply_name: "Leche evaporada", unit: "unid", quantity: 24, sent_on: "2026-10-15", status: "received" },
    { from_comedor_id: "a", to_comedor_id: "c", supply_name: "Aceite", unit: "L", quantity: 3, sent_on: "2026-10-16", status: "sent" },
    // This week: not last week's.
    { from_comedor_id: "a", to_comedor_id: "c", supply_name: "Aceite", unit: "L", quantity: 2, sent_on: "2026-10-20", status: "sent" },
  ];
  const report = buildG10Report({
    groupName: "VES Sur",
    weekStart: "2026-10-19",
    today: cutoff,
    kitchens,
    supplies,
    movements,
    transfers,
  });

  it("cuts the stock at today and counts kitchens with stock data", () => {
    expect(report.cutoff).toEqual({ date: cutoff, label: "Jue 22/10/2026" });
    expect(report.coverage).toEqual({ withData: 5, total: 6 });
  });

  it("lists who is short and who has extra of each comparable supply", () => {
    expect(report.rows.map((r) => r.label)).toEqual(["Arroz", "Aceite"]);
    expect(report.rows[0]!.short.map((k) => [k.nombre, k.days])).toEqual([
      ["San Martín", 2],
      ["Cristo Rey", 3],
    ]);
    expect(report.rows[0]!.surplus.map((k) => [k.nombre, k.days])).toEqual([
      ["Virgen del Carmen", 12],
      ["Sagrado Corazón", 9],
    ]);
    expect(report.rows[1]!.short.map((k) => k.days)).toEqual([1, 2]);
  });

  it("suggests loans that keep lenders above 8 days and lift receivers towards 6", () => {
    expect(
      report.suggestions.map((s) => [s.label, s.from, s.to, s.quantity, s.unit, s.daysBefore, s.daysAfter]),
    ).toEqual([
      ["Arroz", "Virgen del Carmen", "San Martín", 40, "kg", 2, 6],
      ["Arroz", "Sagrado Corazón", "Cristo Rey", 10, "kg", 3, 4],
      ["Aceite", "Virgen del Carmen", "Cristo Rey", 3, "L", 1, 3],
    ]);
  });

  it("lends once per lender and receiver, and only counts extra of supplies someone is short of", () => {
    const r = buildG10Report({
      groupName: "VES Sur",
      weekStart: "2026-10-19",
      today: cutoff,
      kitchens,
      supplies: [
        supply("a-arroz", "a", "Arroz", "kg", 120),
        // Needs 32 kg to reach 6 days: 30 kg after rounding, never a second 2 kg loan from a.
        supply("b-arroz", "b", "Arroz", "kg", 28),
        supply("c-pca", "c", "Arroz (PCA)", "kg", 100),
        supply("d-pca", "d", "Arroz (PCA)", "kg", 100),
      ],
      movements: [use("a-arroz", 10), use("b-arroz", 10), use("c-pca", 10), use("d-pca", 10)],
      transfers: [],
    });
    expect(r.suggestions.map((x) => [x.from, x.to, x.quantity])).toEqual([["Virgen del Carmen", "San Martín", 30]]);
    expect(r.counts.surplusKitchens).toBe(1);
  });

  it("counts kitchens, supplies and the shortages the loans cover", () => {
    expect(report.counts).toEqual({
      shortKitchens: 2,
      shortSupplies: 2,
      surplusKitchens: 2,
      suggested: 3,
      covered: 2,
      shortages: 4,
    });
  });

  it("warns when lending is not enough", () => {
    expect(report.warnings).toEqual([
      { label: "Aceite", groupDays: 4, servings: 1000, uncovered: ["Cristo Rey", "San Martín"] },
    ]);
  });

  it("lists last week's loans and how many arrived", () => {
    expect(report.previous.map((t) => [t.date, t.label, t.from, t.to, t.quantity, t.unit, t.received])).toEqual([
      ["2026-10-14", "Arroz", "Sagrado Corazón", "Cristo Rey", 25, "kg", true],
      ["2026-10-15", "Leche evaporada", "Virgen del Carmen", "San Martín", 24, "unid", true],
      ["2026-10-16", "Aceite", "Virgen del Carmen", "Cristo Rey", 3, "L", false],
    ]);
    expect(report.previousReceived).toBe(2);
  });
});
