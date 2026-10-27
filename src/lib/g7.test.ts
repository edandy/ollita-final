import { describe, expect, it } from "vitest";
import { buildG7Report, formatG7People, g7Weeks, type G7Pickup } from "./g7";

describe("formatG7People", () => {
  it("rounds people so small groups never show exactly", () => {
    expect(formatG7People(0)).toBe("0");
    expect(formatG7People(3)).toBe("<5");
    expect(formatG7People(47)).toBe("~45");
    expect(formatG7People(48)).toBe("~50");
    expect(formatG7People(234)).toBe("~230");
    expect(formatG7People(2_291)).toBe("~2 300");
  });
});

describe("g7Weeks", () => {
  it("cuts Monday–Saturday weeks to the month", () => {
    expect(g7Weeks("2026-09-01", "2026-09-30").map((w) => w.label)).toEqual([
      "1 al 5",
      "7 al 12",
      "14 al 19",
      "21 al 26",
      "28 al 30",
    ]);
    expect(g7Weeks("2026-10-01", "2026-10-27").map((w) => w.label)).toEqual([
      "1 al 3",
      "5 al 10",
      "12 al 17",
      "19 al 24",
      "26 al 27",
    ]);
  });
});

describe("buildG7Report", () => {
  const kitchens = [
    { id: "a", nombre: "Virgen del Carmen" },
    { id: "b", nombre: "Cristo Rey" },
    { id: "c", nombre: "Villa Hermosa" },
  ];
  const days = ["2026-09-01", "2026-09-02", "2026-09-07", "2026-09-21", "2026-09-28"];
  const menus = [
    ...days.map((fecha, i) => ({ id: `a${i}`, comedor_id: "a", fecha })),
    ...days.map((fecha, i) => ({ id: `b${i}`, comedor_id: "b", fecha })),
  ];
  const people = [
    { id: "pa1", comedor_id: "a", dni: "1", care_group: "older_adult", carga_familiar: 2 },
    { id: "pa2", comedor_id: "a", dni: "2", care_group: "child", carga_familiar: 0 },
    { id: "pb1", comedor_id: "b", dni: "1", care_group: "older_adult", carga_familiar: 2 },
    { id: "pb3", comedor_id: "b", dni: "3", care_group: null, carga_familiar: 4 },
  ];
  const padron = (menu_id: string, comedor_id: string, beneficiario_id: string, dni: string): G7Pickup => ({
    menu_id,
    comedor_id,
    cantidad: 1,
    codigo: `EXXXXX-${menu_id}`,
    dni,
    beneficiario_id,
  });
  const pickups: G7Pickup[] = [
    // Person 1 eats in both kitchens: 3 days in a, 2 in b, one of them the same day → 4 days.
    padron("a0", "a", "pa1", "1"),
    padron("a1", "a", "pa1", "1"),
    padron("a2", "a", "pa1", "1"),
    padron("b2", "b", "pb1", "1"),
    padron("b3", "b", "pb1", "1"),
    padron("a3", "a", "pa2", "2"),
    padron("b4", "b", "pb3", "3"),
    { menu_id: "a0", comedor_id: "a", cantidad: 40, codigo: "LXXXXX-1", dni: null, beneficiario_id: null },
    { menu_id: "b0", comedor_id: "b", cantidad: 20, codigo: "LXXXXX-2", dni: "77", beneficiario_id: null },
    { menu_id: "b4", comedor_id: "b", cantidad: 33, codigo: "LXXXXX-3", dni: null, beneficiario_id: null },
  ];
  const supplies = [
    { id: "s1", comedor_id: "a", unidad: "kg", origen: "municipalidad", stock_actual: 0 },
    { id: "s2", comedor_id: "a", unidad: "L", origen: "comprado", stock_actual: 5 },
    { id: "s3", comedor_id: "a", unidad: "unid", origen: "donado", stock_actual: 10 },
    { id: "s4", comedor_id: "b", unidad: "kg", origen: "donado", stock_actual: 3 },
    { id: "s5", comedor_id: "b", unidad: "kg", origen: "municipalidad", stock_actual: 50 },
  ];
  const movements = [
    // a: 30 kg municipal on the 1st, used up on the 7th.
    { insumo_id: "s1", tipo: "ingreso", cantidad: 30, fecha: "2026-09-01" },
    { insumo_id: "s1", tipo: "salida", cantidad: 15, fecha: "2026-09-02" },
    { insumo_id: "s1", tipo: "salida", cantidad: 15, fecha: "2026-09-07" },
    { insumo_id: "s2", tipo: "ingreso", cantidad: 10, fecha: "2026-09-03" },
    { insumo_id: "s2", tipo: "ingreso", cantidad: 99, fecha: "2026-08-30" },
    { insumo_id: "s3", tipo: "ingreso", cantidad: 500, fecha: "2026-09-03" },
    { insumo_id: "s4", tipo: "ingreso", cantidad: 10, fecha: "2026-09-10" },
    // b: municipal lasts all month.
    { insumo_id: "s5", tipo: "ingreso", cantidad: 50, fecha: "2026-09-01" },
  ];
  const report = buildG7Report({
    groupName: "VES Sur",
    allyName: "Red Solidaria Sur",
    monthStart: "2026-09-01",
    today: "2026-10-27",
    kitchens,
    menus,
    pickups,
    people,
    supplies,
    movements,
    team: { hours: 6858, sociasEnTurnos: 203, womenRate: 0.95 },
  });

  it("totals servings and counts each person once across kitchens", () => {
    expect(report.coverage).toEqual({ withData: 2, total: 3 });
    expect(report.servings).toBe(100);
    // DNIs 1, 2, 3 and the walk-in 77; the lump without DNI is not a person.
    expect(report.people).toBe(4);
    // Plus the family load of padrón people 1 (2), 2 (0) and 3 (4).
    expect(report.reached).toBe(10);
    expect(report.averageLoad).toBe(2);
  });

  it("splits servings by week and flags partial weeks", () => {
    expect(report.weeks.map((w) => [w.label, w.servings])).toEqual([
      ["1 al 5", 62],
      ["7 al 12", 2],
      ["14 al 19", 0],
      ["21 al 26", 2],
      ["28 al 30", 34],
    ]);
    expect(report.partialWeeks).toBe(true);
  });

  it("shares padrón people by care group, leaving out unclassified ones", () => {
    expect(report.categories.map((c) => [c.key, c.people])).toEqual([
      ["older_adult", 1],
      ["child", 1],
      ["social_case", 0],
      ["disability", 0],
      ["mothers", 0],
    ]);
    expect(report.categories[0]!.share).toBe(0.5);
    expect(report.padronShare).toBeCloseTo(7 / 100, 6);
  });

  it("buckets padrón people by days with a serving in any kitchen", () => {
    expect(report.dependency.map((d) => d.people)).toEqual([3, 0, 0, 0]);
    expect(report.frequentShare).toBe(0);
  });

  it("adds kilos and litres by origin and leaves units out", () => {
    expect(report.origins).toEqual([
      { key: "municipalidad", label: "Municipalidad (PCA)", kilos: 80, share: 80 / 100 },
      { key: "comprado", label: "Compras de los comedores", kilos: 10, share: 10 / 100 },
      { key: "donado", label: "Donaciones", kilos: 10, share: 10 / 100 },
    ]);
    expect(report.kilos).toBe(100);
  });

  it("counts entries linked to a donation lot as donations, whatever the supply's origin", () => {
    const withLot = buildG7Report({
      groupName: "VES Sur",
      allyName: null,
      monthStart: "2026-09-01",
      today: "2026-10-27",
      kitchens,
      menus,
      pickups,
      people,
      supplies,
      movements: [...movements, { insumo_id: "s2", tipo: "ingreso", cantidad: 20, fecha: "2026-09-05", donation_id: "d1" }],
      team: { hours: 0, sociasEnTurnos: 0, womenRate: null },
    });
    expect(withLot.origins.map((o) => [o.key, o.kilos])).toEqual([
      ["municipalidad", 80],
      ["comprado", 10],
      ["donado", 30],
    ]);
  });

  it("finds when municipal food ran out and the servings after it", () => {
    // a ran out on the 7th; only its pickup on the 21st comes after. b never ran out.
    expect(report.gap).toEqual({ averageDay: 7, kitchens: 1, servingsAfterShare: 1 / 100 });
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG7Report({
      groupName: "Vacío",
      allyName: null,
      monthStart: "2026-10-01",
      today: "2026-10-27",
      kitchens: [],
      menus: [],
      pickups: [],
      people: [],
      supplies: [],
      movements: [],
      team: { hours: 0, sociasEnTurnos: 0, womenRate: null },
    });
    expect(empty.month.until).toBe("2026-10-27");
    expect(empty.servings).toBe(0);
    expect(empty.averageLoad).toBe(0);
    expect(empty.gap).toBeNull();
    expect(empty.kilos).toBe(0);
  });
});
