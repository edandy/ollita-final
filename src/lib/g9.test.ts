import { describe, expect, it } from "vitest";
import { buildG9Report, extractReservationCodes } from "./g9";

describe("extractReservationCodes", () => {
  it("finds every reservation code in a caja note", () => {
    expect(extractReservationCodes("Entrega EAB2CD-K7PQ · Ana · 2 ración(es)")).toEqual(["EAB2CD-K7PQ"]);
    expect(extractReservationCodes("Reserva lab2cd-zz99 y LXYZ23-AB34")).toEqual(["LAB2CD-ZZ99", "LXYZ23-AB34"]);
    expect(extractReservationCodes(null)).toEqual([]);
  });
});

describe("buildG9Report", () => {
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen" },
    { id: "b", nombre: "Cristo Rey" },
    { id: "c", nombre: "Villa Hermosa" },
  ];
  // Week of Mon 19/10 to Sat 24/10, seen on Thu 22/10.
  const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
  const menus = [
    ...week.map((fecha) => ({ comedor_id: "a", fecha })),
    ...week.map((fecha) => ({ comedor_id: "b", fecha })),
    { comedor_id: "c", fecha: "2026-10-08" },
    { comedor_id: "a", fecha: "2026-09-01" },
  ];
  const cashDays = [
    { id: "ca1", comedor_id: "a", fecha: "2026-10-19", cerrado: true, total_ingresos: 10 },
    { id: "cb1", comedor_id: "b", fecha: "2026-10-19", cerrado: true, total_ingresos: 25 },
    { id: "cb2", comedor_id: "b", fecha: "2026-10-20", cerrado: false, total_ingresos: 99 },
    { id: "cb3", comedor_id: "b", fecha: "2026-10-21", cerrado: true, total_ingresos: 5.3 },
  ];
  const transactions = [
    { caja_dia_id: "ca1", tipo: "ingreso", categoria: "venta_menus", monto: 10, nota: "Entrega EAAAAA-0001 · Ana" },
    { caja_dia_id: "cb1", tipo: "ingreso", categoria: "venta_menus", monto: 10, nota: "Reserva LBBBBB-0001 · Luz" },
    { caja_dia_id: "cb1", tipo: "egreso", categoria: "compra_frescos", monto: 50, nota: "Entrega LBBBBB-0002" },
    { caja_dia_id: "cb3", tipo: "ingreso", categoria: "venta_menus", monto: 5, nota: null },
  ];
  const pickups = [
    { id: "r1", comedor_id: "a", codigo: "EAAAAA-0001", cantidad: 2, fecha: "2026-10-19", beneficiario_id: "p1" },
    { id: "r2", comedor_id: "b", codigo: "LBBBBB-0001", cantidad: 2, fecha: "2026-10-19", beneficiario_id: null },
    // Sold in another kitchen's note or as an expense: still without income.
    { id: "r3", comedor_id: "b", codigo: "LBBBBB-0002", cantidad: 1, fecha: "2026-10-19", beneficiario_id: null },
    { id: "r4", comedor_id: "b", codigo: "EAAAAA-0001", cantidad: 1, fecha: "2026-10-20", beneficiario_id: null },
    // On credit: has a debt, not missing income.
    { id: "r5", comedor_id: "b", codigo: "LBBBBB-0003", cantidad: 1, fecha: "2026-10-21", beneficiario_id: null },
    // Earlier in the month: counts for padrón adoption only.
    { id: "r6", comedor_id: "b", codigo: "EBBBBB-0009", cantidad: 3, fecha: "2026-10-02", beneficiario_id: "p9" },
  ];
  const activity = [
    { user_id: "u1", comedor_id: "a", day: "2026-10-22" },
    { user_id: "u2", comedor_id: "a", day: "2026-10-15" },
    { user_id: "u3", comedor_id: "b", day: "2026-10-20" },
    { user_id: "u3", comedor_id: "b", day: "2026-10-01" },
    { user_id: "u4", comedor_id: "c", day: "2026-10-08" },
    { user_id: "u5", comedor_id: "c", day: "2026-10-07" },
  ];
  const report = buildG9Report({
    groupName: "VES Sur",
    groupSince: "2026-08-01T10:00:00Z",
    weekStart: "2026-10-21",
    today: "2026-10-22",
    kitchens,
    activity,
    menus,
    cashDays,
    transactions,
    debts: [{ reservation_id: "r5" }],
    pickups,
    pending: [
      { comedor_id: "b", fecha: "2026-10-20" },
      { comedor_id: "b", fecha: "2026-10-22" },
    ],
    people: [
      { comedor_id: "a", dni: "1", nombre_completo: "Ana Quispe" },
      { comedor_id: "b", dni: "1", nombre_completo: "Ana Quispe" },
      { comedor_id: "b", dni: "2", nombre_completo: "Luz Rojas" },
      { comedor_id: "b", dni: "3", nombre_completo: " luz  ROJAS" },
      { comedor_id: "b", dni: "4", nombre_completo: "Luz Rojás" },
    ],
    movements: [
      { comedor_id: "a", fecha: "2026-10-20" },
      { comedor_id: "b", fecha: "2026-09-30" },
    ],
    shifts: [{ comedor_id: "a", fecha: "2026-10-05" }],
  });
  const byId = Object.fromEntries(report.kitchens.map((k) => [k.id, k]));

  it("cuts the week at today and dates the group", () => {
    expect(report.week).toMatchObject({ from: "2026-10-19", to: "2026-10-24", cutoff: "2026-10-22", label: "19 al 24/10/2026" });
    expect(report.groupSince).toBe("01/08/2026");
    expect(report.coverage).toEqual({ withData: 2, total: 3 });
  });

  it("counts active kitchens and members in 7 and 30 days", () => {
    expect(report.activeKitchens).toEqual({ days7: 2, days30: 3 });
    // u1 and u3 in the last 7 days; only u2 in the 7 days before.
    expect(report.users).toEqual({ current: 2, delta: 1 });
    expect(report.servings).toBe(7);
    expect(report.people).toBe(4);
  });

  it("finds unbalanced closed cash, deliveries without income and duplicates", () => {
    expect(byId.a).toMatchObject({ users: 1, lastRecord: "2026-10-22", unbalanced: 0, unpaid: 0, duplicates: 0, pending: 0, complete: true });
    expect(byId.b).toMatchObject({ users: 1, unbalanced: 1, unpaid: 2, duplicates: 2, pending: 1, complete: false });
    expect(byId.c).toMatchObject({ hasData: false, users: 0, lastRecord: "2026-10-08", complete: false });
  });

  it("orders kitchens by problems and keeps those without data last", () => {
    expect(report.kitchens.map((k) => k.id)).toEqual(["b", "a", "c"]);
    expect(report.totals).toEqual({ users: 2, unbalanced: 1, unpaid: 2, duplicates: 2, pending: 1, complete: 1 });
  });

  it("charts active kitchens in the last eight weeks", () => {
    expect(report.weeks.map((w) => [w.label, w.active])).toEqual([
      ["31/8", 1],
      ["7/9", 0],
      ["14/9", 0],
      ["21/9", 0],
      ["28/9", 1],
      ["5/10", 2],
      ["12/10", 0],
      ["19/10", 2],
    ]);
  });

  it("measures each module's adoption in the month", () => {
    expect(report.modules).toEqual([
      { key: "menu", label: "Menú", kitchens: 3 },
      { key: "padron", label: "Padrón", kitchens: 2 },
      { key: "caja", label: "Caja", kitchens: 2 },
      { key: "insumos", label: "Insumos", kitchens: 1 },
      { key: "turnos", label: "Turnos", kitchens: 1 },
    ]);
    expect(report.month.label).toBe("octubre");
  });
});
