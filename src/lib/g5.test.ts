import { describe, expect, it } from "vitest";
import { G5_HOURLY_VALUE, buildG5Report, serviceDates, type G5Shift } from "./g5";

describe("serviceDates", () => {
  it("keeps the kitchen's service weekdays, with or without accents", () => {
    expect(serviceDates(["lun", "mié", "sáb"], "2026-10-01", "2026-10-07")).toEqual([
      "2026-10-03",
      "2026-10-05",
      "2026-10-07",
    ]);
    expect(serviceDates(["mie"], "2026-10-01", "2026-10-07")).toEqual(["2026-10-07"]);
  });
});

describe("buildG5Report", () => {
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen", dias_atencion: ["lun", "mar", "mie", "jue", "vie", "sab"] },
    { id: "b", nombre: "Cristo Rey", dias_atencion: ["lun", "mar", "mie", "jue", "vie"] },
    { id: "c", nombre: "Villa Hermosa", dias_atencion: ["lun", "mar", "mie", "jue", "vie"] },
  ];
  const shift = (comedor_id: string, day: number, socias: string[]): G5Shift => ({
    comedor_id,
    fecha: `2026-10-0${day}`,
    socias,
  });
  const shifts: G5Shift[] = [
    shift("a", 1, ["Ana", "Bea", "Ceci"]),
    shift("a", 2, ["Ana", "Bea"]),
    shift("a", 3, ["ana ", "Dora"]),
    shift("a", 5, []),
    shift("a", 6, ["Ana"]),
    shift("a", 8, ["Ana"]),
    shift("b", 4, ["Eva"]),
    shift("b", 5, ["Eva", "Flor"]),
    shift("b", 6, ["Eva"]),
    shift("b", 7, ["Gina"]),
  ];
  const members = [
    { comedor_id: "a", cargo: "presidenta", dni: "1" },
    { comedor_id: "a", cargo: "tesorera", dni: "2" },
    { comedor_id: "a", cargo: "almacenera", dni: "3" },
    { comedor_id: "a", cargo: "socia", dni: "9" },
    { comedor_id: "b", cargo: "presidenta", dni: "4" },
    { comedor_id: "b", cargo: "tesorera", dni: "5" },
    { comedor_id: "c", cargo: "presidenta", dni: "6" },
  ];
  const people = [
    { comedor_id: "a", dni: "1", sex: "female" },
    { comedor_id: "a", dni: "2", sex: "male" },
    { comedor_id: "a", dni: "3", sex: null },
    { comedor_id: "b", dni: "4", sex: "female" },
    { comedor_id: "b", dni: "5", sex: "female" },
    { comedor_id: "a", dni: "4", sex: "male" },
  ];
  const report = buildG5Report({
    groupName: "VES Sur",
    monthStart: "2026-10-01",
    today: "2026-10-07",
    kitchens,
    members,
    people,
    shifts,
    supervisedKitchenIds: ["a", "c", "zz"],
  });

  it("covers the month up to today and counts kitchens with shifts", () => {
    expect(report.month).toMatchObject({ label: "Octubre 2026", until: "2026-10-07" });
    expect(report.coverage).toEqual({ withData: 2, total: 3 });
    expect(report.supervised).toEqual({ count: 2, total: 3 });
  });

  it("measures shift coverage on service days and hours on every shift", () => {
    const [a, b, c] = report.kitchens;
    expect(a).toMatchObject({ id: "a", hasData: true, hours: 40 });
    expect(a!.coverage).toBeCloseTo(4 / 6, 6);
    expect(b).toMatchObject({ id: "b", hasData: true, hours: 25 });
    expect(b!.coverage).toBeCloseTo(0.6, 6);
    expect(c).toMatchObject({ id: "c", hasData: false, hours: 0 });
    expect(report.shiftCoverage).toBeCloseTo(7 / 11, 6);
    expect(report.hours).toBe(65);
    expect(report.workValue).toBeCloseTo(65 * G5_HOURLY_VALUE, 6);
  });

  it("names the missing board roles of kitchens with data", () => {
    expect(report.kitchens.map((k) => k.missing)).toEqual([[], ["almacenera"], []]);
    expect(report.boards).toEqual({ complete: 1, evaluated: 2 });
  });

  it("counts members by role and distinct socias per kitchen", () => {
    expect(report.roles).toEqual({
      presidentas: 2,
      tesoreras: 2,
      almaceneras: 1,
      sociasEnTurnos: 7,
      total: 12,
    });
  });

  it("counts women in board roles among those with a recorded sex", () => {
    expect(report.women).toEqual({ women: 3, known: 4, unknown: 1, rate: 0.75 });
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG5Report({
      groupName: "Vacío",
      monthStart: "2026-09-01",
      today: "2026-10-27",
      kitchens: [],
      members: [],
      people: [],
      shifts: [],
      supervisedKitchenIds: [],
    });
    expect(empty.month.until).toBeNull();
    expect(empty.coverage).toEqual({ withData: 0, total: 0 });
    expect(empty.shiftCoverage).toBe(0);
    expect(empty.women).toEqual({ women: 0, known: 0, unknown: 0, rate: 0 });
    expect(empty.kitchens).toEqual([]);
  });
});
