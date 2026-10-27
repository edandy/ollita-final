import { describe, expect, it } from "vitest";
import {
  buildG4Report,
  formatG4Count,
  g4Period,
  shiftYear,
  yearRange,
  type G4Beneficiary,
  type G4Pickup,
} from "./g4";

describe("periods", () => {
  it("maps a day to its year", () => {
    expect(yearRange("2026-09-17")).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
    expect(shiftYear("2026-09-17", -1)).toBe("2025-01-01");
  });

  it("builds month and year periods, cut at today while they run", () => {
    expect(g4Period("month", "2026-09-10", "2026-10-27")).toEqual({
      mode: "month",
      from: "2026-09-01",
      to: "2026-09-30",
      label: "Setiembre 2026",
      until: null,
    });
    expect(g4Period("month", "2026-10-01", "2026-10-27").until).toBe("2026-10-27");
    expect(g4Period("year", "2026-03-01", "2026-10-27")).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
      label: "2026",
      until: "2026-10-27",
    });
    expect(g4Period("year", "2025-03-01", "2026-10-27").until).toBeNull();
  });
});

describe("formatG4Count", () => {
  it("hides counts from 1 to 4", () => {
    expect(formatG4Count(0)).toBe("0");
    expect(formatG4Count(4)).toBe("<5");
    expect(formatG4Count(5)).toBe("5");
    expect(formatG4Count(1012)).toBe("1 012");
  });
});

let seq = 0;
function ben(over: Partial<G4Beneficiary> & Pick<G4Beneficiary, "comedor_id" | "dni">): G4Beneficiary {
  seq += 1;
  return {
    id: `b${seq}`,
    activo: true,
    care_group: null,
    birth_date: null,
    carga_familiar: 0,
    telefono: null,
    direccion: null,
    foto_url: null,
    created_at: "2026-01-10T15:00:00Z",
    ...over,
  };
}

describe("buildG4Report", () => {
  const kitchens = [
    { id: "a", nombre: "Demo · Virgen del Carmen" },
    { id: "b", nombre: "Cristo Rey" },
    { id: "c", nombre: "Santa Rosa" },
    { id: "d", nombre: "Villa Hermosa" },
  ];
  const beneficiaries: G4Beneficiary[] = [
    // Kitchen a
    ben({ comedor_id: "a", dni: "10000001", care_group: "older_adult", birth_date: "1960-01-01", carga_familiar: 2, telefono: "999999999", direccion: "Av. 1" }),
    ben({ comedor_id: "a", dni: "10000002", care_group: "older_adult", birth_date: "1940-05-05", telefono: "999999998", foto_url: "x.jpg" }),
    ben({ comedor_id: "a", dni: "10000003", care_group: "child", birth_date: "2023-02-02", carga_familiar: 4, created_at: "2026-09-15T20:00:00Z" }),
    ben({ comedor_id: "a", dni: "10000004", care_group: "pregnant", birth_date: "1998-01-01", telefono: "999999997" }),
    ben({ comedor_id: "a", dni: "10000009", activo: false, care_group: "disability" }),
    // Kitchen b: shares 10000001 and 10000004 with a
    ben({ comedor_id: "b", dni: "10000001", care_group: null, carga_familiar: 1 }),
    ben({ comedor_id: "b", dni: " 10000004 ", care_group: "lactating" }),
    ben({ comedor_id: "b", dni: "10000005", care_group: "child", birth_date: "2016-06-06", direccion: "Jr. 2" }),
    ben({ comedor_id: "b", dni: "10000006", care_group: null, created_at: "2026-09-30T23:30:00-05:00" }),
    // Kitchen c: 10000001 again (three padrones)
    ben({ comedor_id: "c", dni: "10000001", telefono: "999999990" }),
    ben({ comedor_id: "c", dni: "10000007", care_group: "disability", telefono: "999999991", direccion: "Calle 3", foto_url: "y.jpg" }),
    // Kitchen d has only an inactive row
    ben({ comedor_id: "d", dni: "10000008", activo: false }),
  ];
  const idOf = (comedor: string, dni: string) =>
    beneficiaries.find((b) => b.comedor_id === comedor && b.dni.trim() === dni)!.id;
  const pickups: G4Pickup[] = [
    { comedor_id: "a", dni: null, beneficiario_id: idOf("a", "10000002") },
    { comedor_id: "b", dni: "10000003", beneficiario_id: null },
    { comedor_id: "c", dni: null, beneficiario_id: idOf("c", "10000001") },
    { comedor_id: "c", dni: "10000007", beneficiario_id: null },
    { comedor_id: "a", dni: "77777777", beneficiario_id: null },
  ];
  const report = buildG4Report({
    groupName: "VES Sur",
    mode: "month",
    start: "2026-09-01",
    today: "2026-10-27",
    kitchens,
    beneficiaries,
    pickups,
  });

  it("counts kitchens with an active padrón as covered", () => {
    expect(report.coverage).toEqual({ withData: 3, total: 4 });
    expect(report.period.label).toBe("Setiembre 2026");
  });

  it("counts new entries in the period by Lima date", () => {
    // 10000006 was created at 23:30 Lima on 30/09, which is already October in UTC.
    expect(report.newEntries).toBe(2);
  });

  it("counts each person once across padrones", () => {
    expect(report.activeRows).toBe(10);
    expect(report.activePeople).toBe(7);
  });

  it("adds each person's family load once", () => {
    // Loads per person: 2 (max of 2,1,0), 0, 4, 0, 0, 0, 0
    expect(report.coveredPeople).toBe(7 + 6);
    expect(report.averageLoad).toBeCloseTo(6 / 7, 6);
  });

  it("matches pickups by padrón id or by DNI", () => {
    expect(report.servedPeople).toBe(4);
    expect(report.usage).toBeCloseTo(4 / 7, 6);
  });

  it("breaks people down by care group with age bands", () => {
    expect(report.categories.map((c) => [c.key, c.people])).toEqual([
      ["older_adult", 2],
      ["child", 2],
      ["disability", 1],
      ["mothers", 1],
      ["social_case", 0],
      ["unclassified", 1],
    ]);
    const older = report.categories[0]!;
    expect(older.label).toBe("Adultos mayores");
    expect(older.parts).toEqual([
      { label: "60 a 74 años", count: 1 },
      { label: "75 o más", count: 1 },
    ]);
    expect(report.categories[1]!.parts).toEqual([
      { label: "0 a 5 años", count: 1 },
      { label: "6 a 12 años", count: 1 },
    ]);
    // 10000004 is pregnant in a and lactating in b: the first row with a group wins.
    expect(report.categories[2]!.parts).toBeNull();
    expect(report.categories[3]!.parts).toEqual([
      { label: "Gestantes", count: 1 },
      { label: "lactantes", count: 0 },
    ]);
  });

  it("lists unused padrón entries and phone coverage per kitchen", () => {
    expect(report.kitchens).toEqual([
      { id: "b", nombre: "Cristo Rey", inactive: 3, phoneRate: 0 },
      { id: "a", nombre: "Demo · Virgen del Carmen", inactive: 1, phoneRate: 0.75 },
      { id: "c", nombre: "Santa Rosa", inactive: 0, phoneRate: 1 },
    ]);
    expect(report.groupInactive).toBe(3);
    expect(report.groupPhoneRate).toBeCloseTo(4 / 7, 6);
  });

  it("summarizes data completeness with the kitchen range", () => {
    expect(report.completeness.phone).toEqual({ rate: 4 / 7, min: 0, max: 1 });
    expect(report.completeness.address.rate).toBeCloseTo(3 / 7, 6);
    expect(report.completeness.address.min).toBeCloseTo(0.25, 6);
    expect(report.completeness.address.max).toBeCloseTo(0.5, 6);
    expect(report.completeness.photo).toEqual({ rate: 2 / 7, min: 0, max: 0.5 });
  });

  it("counts people in more than one padrón and the kitchen pairs they link", () => {
    expect(report.duplicates.people).toBe(2);
    expect(report.duplicates.inTwo).toBe(1);
    expect(report.duplicates.inThreeOrMore).toBe(1);
    expect(report.duplicates.maxKitchens).toBe(3);
    expect(report.duplicates.pairs).toEqual([
      { names: ["Cristo Rey", "Demo · Virgen del Carmen"], people: 2 },
      { names: ["Cristo Rey", "Santa Rosa"], people: 1 },
      { names: ["Demo · Virgen del Carmen", "Santa Rosa"], people: 1 },
    ]);
  });

  it("returns an empty report without kitchens", () => {
    const empty = buildG4Report({
      groupName: "Vacío",
      mode: "year",
      start: "2026-01-01",
      today: "2026-10-27",
      kitchens: [],
      beneficiaries: [],
      pickups: [],
    });
    expect(empty.coverage).toEqual({ withData: 0, total: 0 });
    expect(empty.activePeople).toBe(0);
    expect(empty.usage).toBe(0);
    expect(empty.averageLoad).toBe(0);
    expect(empty.kitchens).toEqual([]);
    expect(empty.completeness.phone).toEqual({ rate: 0, min: 0, max: 0 });
    expect(empty.duplicates.people).toBe(0);
  });
});
