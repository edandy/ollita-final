import { describe, expect, it } from "vitest";
import { buildG11Report, type G11Movement } from "./g11";

describe("buildG11Report", () => {
  const today = "2026-10-27";
  const monSat = ["lun", "mar", "mie", "jue", "vie", "sab"];
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen", dias_atencion: monSat },
    { id: "b", nombre: "Cristo Rey", dias_atencion: monSat },
    { id: "c", nombre: "Santa María", dias_atencion: ["lun", "mie", "vie"] },
    { id: "d", nombre: "Las Flores", dias_atencion: monSat },
    { id: "e", nombre: "Villa Hermosa", dias_atencion: monSat },
  ];
  const supply = (
    id: string,
    comedor_id: string,
    nombre: string,
    unidad: string,
    stock_actual: number,
    precio_referencial: number | null,
    origen = "comprado",
  ) => ({ id, comedor_id, nombre, unidad, stock_actual, precio_referencial, origen });
  const supplies = [
    supply("a-arroz", "a", "Arroz", "kg", 50, 4.2),
    supply("b-arroz", "b", "arroz", "kg", 300, 4.2),
    supply("c-arroz", "c", "Arroz", "kg", 12, 4.2),
    supply("d-arroz", "d", "Arroz", "kg", 1000, 3),
    supply("a-aceite", "a", "Aceite", "L", 5, 9),
    supply("c-aceite", "c", "Aceite", "L", 0, 10),
    // Municipal food is not bought.
    supply("a-pca", "a", "Arroz (PCA)", "kg", 0, null, "municipalidad"),
  ];
  const out = (insumo_id: string, cantidad: number): G11Movement => ({
    insumo_id,
    tipo: "salida",
    cantidad,
    fecha: today,
    precio_unitario: null,
    transfer_id: null,
    donation_id: null,
  });
  const buy = (insumo_id: string, cantidad: number, precio: number, fecha = "2026-10-05"): G11Movement => ({
    insumo_id,
    tipo: "ingreso",
    cantidad,
    fecha,
    precio_unitario: precio,
    transfer_id: null,
    donation_id: null,
  });
  const movements: G11Movement[] = [
    out("a-arroz", 10),
    out("b-arroz", 8),
    out("c-arroz", 4),
    out("d-arroz", 5),
    out("a-aceite", 1),
    out("c-aceite", 0.5),
    out("a-pca", 6),
    buy("a-arroz", 100, 3.5),
    buy("a-arroz", 50, 3.8),
    // Older than 90 days, a loan and a donation lot: not what the kitchen pays.
    buy("a-arroz", 100, 9, "2026-07-01"),
    { ...buy("a-arroz", 40, 1), transfer_id: "t1" },
    { ...buy("a-arroz", 40, 1), donation_id: "d1" },
    buy("c-arroz", 10, 4.4),
  ];
  const report = buildG11Report({
    groupName: "VES Sur",
    monthStart: "2026-11-01",
    today,
    kitchens,
    supplies,
    movements,
    participantIds: ["a", "b", "c"],
    negotiated: { "arroz|kg": 3.5 },
  });

  it("buys for the month with the stock at today", () => {
    expect(report.month).toMatchObject({ from: "2026-11-01", label: "Noviembre 2026" });
    expect(report.cutoff).toBe(today);
    expect(report.participants).toEqual({ count: 3, total: 5 });
    expect(report.coverage).toEqual({ withData: 4, total: 5 });
  });

  it("adds what each taking part kitchen needs for its service days, rounded up to 10", () => {
    // a: 10 × 25 − 50; b: 8 × 25 − 300 → 0; c: 4 × 13 − 12. d does not take part.
    expect(report.items.map((i) => [i.label, i.quantity, i.unit])).toEqual([
      ["Arroz", 240, "kg"],
      ["Aceite", 30, "L"],
    ]);
    expect(report.units).toEqual({ kg: 240, L: 30, unid: 0 });
  });

  it("weights each kitchen's paid price by what it needs, and saves against the negotiated price", () => {
    const [arroz, aceite] = report.items;
    expect(arroz!.currentPrice).toBeCloseTo((200 * 3.6 + 40 * 4.4) / 240, 6);
    expect(arroz!.savings).toBeCloseTo((arroz!.currentPrice! - 3.5) * 240, 6);
    expect(aceite!.currentPrice).toBeCloseTo((20 * 9 + 6.5 * 10) / 26.5, 6);
    expect(aceite).toMatchObject({ negotiated: null, savings: null });
    expect(report.savings.total).toBeCloseTo(arroz!.savings!, 6);
    expect(report.savings.share).toBeCloseTo(arroz!.savings! / (240 * arroz!.currentPrice!), 6);
  });

  it("compares every kitchen's price of the main supply with the group", () => {
    expect(report.main).toMatchObject({ label: "Arroz", unit: "kg", negotiated: 3.5 });
    expect(report.above).toEqual({ count: 2, total: 4 });
    expect(report.chart.map((c) => [c.nombre, c.price])).toEqual([
      ["Santa María", 4.4],
      ["Cristo Rey", 4.2],
      ["Virgen del Carmen", 3.6],
      ["Las Flores", 3],
    ]);
    expect(report.chart.at(-1)!.width).toBe(1);
    expect(report.chart[0]!.diff).toBeCloseTo(4.4 / report.main!.groupPrice - 1, 6);
  });

  it("takes every kitchen with data when the purchase was not saved yet", () => {
    const draft = buildG11Report({
      groupName: "VES Sur",
      monthStart: "2026-11-01",
      today,
      kitchens,
      supplies,
      movements,
      participantIds: null,
      negotiated: {},
    });
    expect(draft.participants).toEqual({ count: 4, total: 5 });
    expect(draft.savings.total).toBe(0);
    expect(draft.main!.negotiated).toBeNull();
  });
});
