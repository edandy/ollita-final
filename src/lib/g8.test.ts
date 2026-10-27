import { describe, expect, it } from "vitest";
import { buildG8Report, g8DurationText, type G8Movement } from "./g8";

describe("g8DurationText", () => {
  it("speaks in weeks of six service days, or in days when short", () => {
    expect(g8DurationText(8, 15)).toBe("dos a tres semanas");
    expect(g8DurationText(7, 12)).toBe("dos semanas");
    expect(g8DurationText(3, 6)).toBe("3 a 6 días");
    expect(g8DurationText(4, 4)).toBe("4 días");
    expect(g8DurationText(1, 1)).toBe("1 día");
  });
});

describe("buildG8Report", () => {
  // Service days of the week of 05/10 and the next one (Monday to Saturday).
  const days = ["05", "06", "07", "08", "09", "10", "12", "13", "14", "15", "16", "17"].map((d) => `2026-10-${d}`);
  const kitchens = [
    { id: "a", nombre: "Virgen del Carmen", foto_url: "/cocina-a.jpg" },
    { id: "b", nombre: "Cristo Rey", foto_url: null },
    { id: "c", nombre: "Villa Hermosa", foto_url: null },
  ];
  const supplies = [
    { id: "a-arroz", comedor_id: "a", nombre: "Arroz", unidad: "kg" },
    { id: "a-men", comedor_id: "a", nombre: "Menestras", unidad: "kg" },
    { id: "b-arroz", comedor_id: "b", nombre: "arroz ", unidad: "kg" },
    { id: "b-men", comedor_id: "b", nombre: "Menestras", unidad: "kg" },
  ];
  const out = (insumo_id: string, fechas: string[], cantidad: number): G8Movement[] =>
    fechas.map((fecha) => ({ insumo_id, tipo: "salida", cantidad, fecha, donation_id: null }));
  const movements: G8Movement[] = [
    { insumo_id: "a-arroz", tipo: "ingreso", cantidad: 100, fecha: "2026-10-05", donation_id: "d1" },
    { insumo_id: "a-arroz", tipo: "ingreso", cantidad: 500, fecha: "2026-10-05", donation_id: null },
    { insumo_id: "a-men", tipo: "ingreso", cantidad: 10, fecha: "2026-10-05", donation_id: "d1" },
    { insumo_id: "b-arroz", tipo: "ingreso", cantidad: 30, fecha: "2026-10-06", donation_id: "d1" },
    { insumo_id: "b-men", tipo: "ingreso", cantidad: 20, fecha: "2026-10-06", donation_id: "d1" },
    { insumo_id: "b-arroz", tipo: "ingreso", cantidad: 99, fecha: "2026-10-06", donation_id: "other" },
    // Before the lot arrived: not part of its use.
    ...out("a-arroz", ["2026-10-03"], 10),
    ...out("a-arroz", days, 10),
    ...out("a-men", days.slice(0, 5), 2),
    ...out("b-arroz", days.slice(1, 4), 10),
    ...out("b-men", days.slice(1, 4), 2),
  ];
  const menus = [
    ...days.map((fecha, i) => ({
      id: `ma${i}`,
      comedor_id: "a",
      fecha,
      nombre_plato: i % 2 ? "Lentejas con arroz" : "Arroz con pollo",
      foto_url: i === 3 ? "/plato.jpg" : null,
    })),
    ...days.map((fecha, i) => ({ id: `mb${i}`, comedor_id: "b", fecha, nombre_plato: "Ají de gallina", foto_url: null })),
  ];
  const pickups = [
    ...menus.filter((m) => m.comedor_id === "a").map((m) => ({ menu_id: m.id, comedor_id: "a", cantidad: 100, dni: null, beneficiario_id: null })),
    ...menus.filter((m) => m.comedor_id === "b").map((m) => ({ menu_id: m.id, comedor_id: "b", cantidad: 50, dni: null, beneficiario_id: null })),
    { menu_id: "ma0", comedor_id: "a", cantidad: 1, dni: "1", beneficiario_id: null },
    { menu_id: "mb1", comedor_id: "b", cantidad: 1, dni: "1", beneficiario_id: null },
    { menu_id: "mb2", comedor_id: "b", cantidad: 1, dni: "2", beneficiario_id: null },
    // After b's window: not fed by the lot.
    { menu_id: "mb9", comedor_id: "b", cantidad: 1, dni: "3", beneficiario_id: null },
  ];
  const base = {
    donation: { id: "d1", code: "D-2026-044", receivedOn: "2026-10-05" },
    donorName: "Alimentos Andinos S.A.C.",
    groupName: "VES Sur",
    groupKitchenCount: 3,
    today: "2026-10-27",
    kitchens,
    supplies,
    movements,
    menus,
    pickups,
  };
  const report = buildG8Report({ ...base, version: "donor" });

  it("uses each share first and measures how long it lasted", () => {
    const [a, b] = report.kitchens;
    expect(a).toMatchObject({ label: "Comedor A", quantities: [100, 10], days: 10 });
    expect(b).toMatchObject({ label: "Comedor B", quantities: [30, 20], days: 3 });
    expect(report.status).toEqual({ done: false, consumed: (100 + 10 + 30 + 6) / 160 });
  });

  it("turns kilos into servings with each kitchen's own yield", () => {
    expect(report.products.map((p) => [p.label, p.quantity, Math.round(p.servings), p.main])).toEqual([
      ["Arroz", 130, 1153, true],
      ["Menestras", 30, 1008, false],
    ]);
    expect(Math.round(report.products[0]!.perServing)).toBe(113);
    expect(report.kitchens.map((k) => Math.round(k.servings))).toEqual([1001, 152]);
    expect(report.servingsKpi).toBe("≈ 1 200");
  });

  it("counts kitchens, days and people fed during each window", () => {
    expect(report.coverage).toEqual({ kitchens: 2, total: 3 });
    expect(report.daysRange).toEqual({ min: 3, max: 10 });
    expect(report.people).toBe(2);
    expect(report.lead).toBe(
      "Gracias por sumar. Su donación al grupo VES Sur se repartió entre 2 de sus 3 comedores y ya se usó el 91%.",
    );
  });

  it("lists the dishes served with it and its photos", () => {
    expect(report.dishes).toEqual(["Arroz con pollo", "Lentejas con arroz", "Ají de gallina"]);
    expect(report.photos).toEqual({ dish: "/plato.jpg", kitchen: "/cocina-a.jpg" });
  });

  it("names kitchens only in the supervision version", () => {
    const supervision = buildG8Report({ ...base, version: "supervision" });
    expect(supervision.kitchens.map((k) => k.label)).toEqual(["Virgen del Carmen", "Cristo Rey"]);
  });

  it("says when the lot was used up", () => {
    const done = buildG8Report({
      ...base,
      version: "donor",
      movements: movements.filter((m) => m.insumo_id !== "b-men"),
    });
    expect(done.status).toEqual({ done: true, consumed: 1 });
    expect(done.lead).toBe(
      "Gracias por sumar. Su donación al grupo VES Sur se repartió entre 2 de sus 3 comedores y se convirtió en almuerzos durante una a dos semanas.",
    );
  });

  it("returns an empty report when no kitchen recorded a share", () => {
    const empty = buildG8Report({ ...base, version: "donor", movements: [] });
    expect(empty.kitchens).toEqual([]);
    expect(empty.products).toEqual([]);
    expect(empty.coverage).toEqual({ kitchens: 0, total: 3 });
    expect(empty.status).toEqual({ done: false, consumed: 0 });
  });
});
