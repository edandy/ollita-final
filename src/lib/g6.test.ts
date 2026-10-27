import { describe, expect, it } from "vitest";
import { buildG6Report, g6Action, g6Status, type G6Counts } from "./g6";

const zero: G6Counts = { noMenu: 0, openCash: 0, supplyAlerts: 0, expired: 0, pending: 0 };

describe("g6Status", () => {
  it("asks to attend when menus, cash or supplies reach 2", () => {
    expect(g6Status({ ...zero, noMenu: 2 })).toBe("attend");
    expect(g6Status({ ...zero, openCash: 2 })).toBe("attend");
    expect(g6Status({ ...zero, supplyAlerts: 3 })).toBe("attend");
  });

  it("asks to review any other alert and is ok when everything is zero", () => {
    expect(g6Status({ ...zero, noMenu: 1, openCash: 1, supplyAlerts: 1 })).toBe("review");
    expect(g6Status({ ...zero, expired: 9 })).toBe("review");
    expect(g6Status({ ...zero, pending: 4 })).toBe("review");
    expect(g6Status(zero)).toBe("ok");
  });
});

describe("g6Action", () => {
  const supplies = [
    { nombre: "Fideos", days: 3 },
    { nombre: "Aceite", days: 2 },
    { nombre: "Azúcar", days: 2 },
  ];

  it("names the supplies that run out first", () => {
    expect(g6Action({ ...zero, supplyAlerts: 3 }, supplies)).toBe("Aceite y azúcar para 2 días");
    expect(g6Action({ ...zero, supplyAlerts: 1 }, [{ nombre: "Arroz", days: 1 }])).toBe("Arroz para 1 día");
    expect(
      g6Action({ ...zero, supplyAlerts: 2 }, [
        { nombre: "Arroz", days: 0 },
        { nombre: "Leche evaporada", days: 0 },
      ]),
    ).toBe("Arroz y leche evaporada agotados");
    expect(g6Action({ ...zero, supplyAlerts: 1 }, [{ nombre: "Arroz", days: 0 }])).toBe("Arroz agotado");
  });

  it("prefers supplies on a tie and joins menus and cash when they lead", () => {
    expect(g6Action({ ...zero, noMenu: 2, openCash: 2, supplyAlerts: 2 }, supplies)).toBe(
      "Aceite y azúcar para 2 días",
    );
    expect(g6Action({ ...zero, noMenu: 3, openCash: 3, supplyAlerts: 1 }, supplies)).toBe(
      "3 días sin menú y 3 cajas sin cerrar",
    );
    expect(g6Action({ ...zero, noMenu: 1 }, [])).toBe("1 día sin menú publicado");
    expect(g6Action({ ...zero, openCash: 1, pending: 1 }, [])).toBe("1 caja sin cerrar");
  });

  it("falls back to pending pickups, then expired cards", () => {
    expect(g6Action({ ...zero, pending: 3 }, [])).toBe("Confirmar 3 entregas pendientes");
    expect(g6Action({ ...zero, pending: 1, expired: 1 }, [])).toBe("Confirmar 1 entrega pendiente");
    expect(g6Action({ ...zero, pending: 1, expired: 2 }, [])).toBe("Renovar 2 carnés vencidos");
    expect(g6Action({ ...zero, expired: 1 }, [])).toBe("Renovar 1 carné vencido");
    expect(g6Action(zero, [])).toBeNull();
  });
});

describe("buildG6Report", () => {
  const weekdays = ["lun", "mar", "mie", "jue", "vie", "sab"];
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen", dias_atencion: weekdays },
    { id: "b", nombre: "Cristo Rey", dias_atencion: weekdays },
    { id: "c", nombre: "Las Flores", dias_atencion: ["lun", "mar", "mie", "jue", "vie"] },
    { id: "d", nombre: "Villa Hermosa", dias_atencion: weekdays },
  ];
  // Week of Mon 19/10 to Sat 24/10, seen on Thu 22/10.
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
  const menus = [
    ...days.map((fecha) => ({ comedor_id: "a", fecha, publicado: true })),
    { comedor_id: "b", fecha: "2026-10-19", publicado: true },
    { comedor_id: "b", fecha: "2026-10-20", publicado: false },
    { comedor_id: "b", fecha: "2026-10-22", publicado: true },
    ...days.map((fecha) => ({ comedor_id: "c", fecha, publicado: true })),
    { comedor_id: "c", fecha: "2026-10-23", publicado: true },
  ];
  const cashDays = [
    ...days.slice(0, 3).map((fecha) => ({ comedor_id: "a", fecha, cerrado: true })),
    { comedor_id: "a", fecha: "2026-10-22", cerrado: false },
    { comedor_id: "b", fecha: "2026-10-19", cerrado: true },
    { comedor_id: "b", fecha: "2026-10-20", cerrado: false },
    { comedor_id: "c", fecha: "2026-10-19", cerrado: true },
    { comedor_id: "c", fecha: "2026-10-20", cerrado: true },
    { comedor_id: "c", fecha: "2026-10-21", cerrado: true },
  ];
  const outflows = (insumo_id: string, perDay: number) =>
    days.slice(0, 3).map((fecha) => ({ insumo_id, tipo: "salida", cantidad: perDay, fecha }));
  const supplies = [
    { id: "a1", comedor_id: "a", nombre: "Arroz", stock_actual: 100 },
    { id: "b1", comedor_id: "b", nombre: "Arroz", stock_actual: 20 },
    { id: "b2", comedor_id: "b", nombre: "Aceite", stock_actual: 3 },
    { id: "b3", comedor_id: "b", nombre: "Azúcar", stock_actual: 50 },
    { id: "c1", comedor_id: "c", nombre: "Aceite", stock_actual: 3 },
  ];
  const movements = [
    ...outflows("a1", 10),
    ...outflows("b1", 10),
    ...outflows("b2", 1.5),
    ...outflows("b3", 1),
    ...outflows("c1", 1.5),
    // After the cutoff: rebuilt back into the stock at the cutoff.
    { insumo_id: "c1", tipo: "salida", cantidad: 1.5, fecha: "2026-10-23" },
  ];
  const people = [
    { comedor_id: "a", vigencia_hasta: "2026-10-22" },
    { comedor_id: "b", vigencia_hasta: "2026-10-01" },
    { comedor_id: "b", vigencia_hasta: "2026-10-21" },
    { comedor_id: "b", vigencia_hasta: null },
    { comedor_id: "c", vigencia_hasta: "2026-12-31" },
  ];
  const pendingReservations = [
    { comedor_id: "a", fecha: "2026-10-22" },
    { comedor_id: "b", fecha: "2026-10-19" },
    { comedor_id: "c", fecha: "2026-10-21" },
    { comedor_id: "c", fecha: "2026-10-12" },
  ];
  const report = buildG6Report({
    groupName: "VES Sur",
    weekStart: "2026-10-21",
    today: "2026-10-22",
    kitchens,
    menus,
    cashDays,
    supplies,
    movements,
    people,
    pendingReservations,
  });
  const byId = Object.fromEntries(report.kitchens.map((k) => [k.id, k]));

  it("cuts the week at today and counts kitchens with records", () => {
    expect(report.week).toMatchObject({ from: "2026-10-19", to: "2026-10-24", cutoff: "2026-10-22" });
    expect(report.week.label).toBe("19 al 24/10/2026");
    expect(report.coverage).toEqual({ withData: 3, total: 4 });
  });

  it("counts each alert up to the cutoff", () => {
    expect(byId.a).toMatchObject({ noMenu: 0, openCash: 0, supplyAlerts: 0, expired: 0, pending: 0, status: "ok" });
    expect(byId.b).toMatchObject({ noMenu: 2, openCash: 2, supplyAlerts: 2, expired: 2, pending: 1 });
    expect(byId.b!.status).toBe("attend");
    expect(byId.b!.action).toBe("Arroz y aceite para 2 días");
    expect(byId.c).toMatchObject({ noMenu: 0, openCash: 0, supplyAlerts: 1, expired: 0, pending: 1 });
    expect(byId.c!.status).toBe("review");
    expect(byId.c!.action).toBe("Aceite para 3 días");
    expect(byId.d).toMatchObject({ status: "noData", action: "Sin registros: llamar a la presidenta" });
  });

  it("orders by status, then by the sum of alerts", () => {
    expect(report.kitchens.map((k) => k.id)).toEqual(["b", "c", "a", "d"]);
    expect(report.counts).toEqual({ attend: 1, review: 1, ok: 1, noData: 1 });
  });

  it("totals the kitchens with records", () => {
    expect(report.totals).toEqual({ noMenu: 2, openCash: 2, supplyAlerts: 3, expired: 2, pending: 2 });
    expect(report.totalsAction).toBe("2 comedores con insumos en alerta");
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG6Report({
      groupName: "Vacío",
      weekStart: "2026-10-19",
      today: "2026-10-27",
      kitchens: [],
      menus: [],
      cashDays: [],
      supplies: [],
      movements: [],
      people: [],
      pendingReservations: [],
    });
    expect(empty.week.cutoff).toBe("2026-10-24");
    expect(empty.coverage).toEqual({ withData: 0, total: 0 });
    expect(empty.counts).toEqual({ attend: 0, review: 0, ok: 0, noData: 0 });
    expect(empty.totalsAction).toBe("Sin insumos en alerta");
  });
});
