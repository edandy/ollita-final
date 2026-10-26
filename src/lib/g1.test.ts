import { describe, expect, it } from "vitest";
import {
  GRAMS_PER_SERVING,
  buildG1Report,
  categoryLabel,
  formatG1Number,
  isPadronChannel,
  isLowOccupancy,
  kitchensForG1,
  leftoverKg,
  occupancy,
  personKey,
  preparedServings,
  shiftWeek,
  weekRangeMonSat,
} from "./g1";

describe("weekRangeMonSat", () => {
  it("maps a Wednesday to that week's Monday–Saturday", () => {
    expect(weekRangeMonSat("2026-10-21")).toEqual({
      from: "2026-10-19",
      to: "2026-10-24",
      label: "19 al 24/10/2026",
    });
  });

  it("keeps Monday as the start of the week", () => {
    expect(weekRangeMonSat("2026-10-19").from).toBe("2026-10-19");
    expect(weekRangeMonSat("2026-10-24").to).toBe("2026-10-24");
  });

  it("puts Sunday on the week that just ended Saturday", () => {
    expect(weekRangeMonSat("2026-10-25")).toEqual({
      from: "2026-10-19",
      to: "2026-10-24",
      label: "19 al 24/10/2026",
    });
  });

  it("labels a week that crosses months", () => {
    expect(weekRangeMonSat("2026-09-30").label).toBe("28/09 al 03/10/2026");
  });

  it("shifts a week forward and back", () => {
    expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26");
    expect(shiftWeek("2026-10-19", -1)).toBe("2026-10-12");
  });
});

describe("raciones", () => {
  it("rebuilds prepared servings from remaining stock plus every reservation", () => {
    expect(preparedServings(10, 90)).toBe(100);
  });

  it("computes occupancy, leftovers and the 90% alert", () => {
    expect(occupancy(88, 100)).toBe(0.88);
    expect(occupancy(0, 0)).toBe(0);
    expect(isLowOccupancy(0.88)).toBe(true);
    expect(isLowOccupancy(0.9)).toBe(false);
    expect(leftoverKg(319)).toBe(105);
    expect(GRAMS_PER_SERVING).toBe(330);
  });
});

describe("canal y personas", () => {
  it("treats E-codes and padrón ids as padrón, L-codes as walk-in", () => {
    expect(isPadronChannel({ codigo: "E7K3P2-ABCD", beneficiario_id: null })).toBe(true);
    expect(isPadronChannel({ codigo: "L7K3P2-ABCD", beneficiario_id: "b1" })).toBe(true);
    expect(isPadronChannel({ codigo: "L7K3P2-ABCD", beneficiario_id: null })).toBe(false);
  });

  it("keys a person by DNI, then by beneficiary id", () => {
    expect(personKey({ dni: " 12345678 ", beneficiario_id: "b1" })).toBe("12345678");
    expect(personKey({ dni: null, beneficiario_id: "b1" })).toBe("b1");
    expect(personKey({ dni: "", beneficiario_id: null })).toBe(null);
  });

  it("labels padrón categories with the real app values", () => {
    expect(categoryLabel("socia_familia", null)).toBe("Familia de socia");
    expect(categoryLabel("publico_recurrente", null)).toBe("Público recurrente");
    expect(categoryLabel("caso_social", "adulto_mayor")).toBe("Adulto mayor");
    expect(categoryLabel("caso_social", "madre_soltera")).toBe("Madre soltera");
    expect(categoryLabel("caso_social", "otro")).toBe("Caso social");
  });
});

describe("kitchensForG1", () => {
  it("gives the admin every kitchen in the group", () => {
    expect(kitchensForG1({
      groupKitchenIds: ["a", "b", "c"],
      assignedKitchenIds: ["b"],
      isAdmin: true,
    })).toEqual(["a", "b", "c"]);
  });

  it("intersects the group with the supervisor's assigned kitchens", () => {
    expect(kitchensForG1({
      groupKitchenIds: ["a", "b", "c"],
      assignedKitchenIds: ["b", "c", "z"],
      isAdmin: false,
    })).toEqual(["b", "c"]);
  });
});

describe("buildG1Report", () => {
  const kitchens = [
    { id: "k1", nombre: "Virgen del Carmen" },
    { id: "k2", nombre: "Cristo Rey" },
    { id: "k3", nombre: "Villa Hermosa" },
  ];

  it("aggregates prepared, delivered, leftovers, channels and unique people", () => {
    const report = buildG1Report({
      groupName: "VES Sur",
      weekStart: "2026-10-21",
      kitchens,
      menus: [
        { id: "m1", comedor_id: "k1", fecha: "2026-10-19", publicado: true, raciones_disponibles: 10 },
        { id: "m2", comedor_id: "k2", fecha: "2026-10-19", publicado: true, raciones_disponibles: 12 },
      ],
      reservations: [
        { menu_id: "m1", comedor_id: "k1", cantidad: 50, estado: "recogida", codigo: "EAAAAA-1111", dni: "11111111", beneficiario_id: "b1", categoria: "socia_familia", subtipo: null },
        { menu_id: "m1", comedor_id: "k1", cantidad: 40, estado: "recogida", codigo: "LAAAAA-2222", dni: "22222222", beneficiario_id: null, categoria: null, subtipo: null },
        { menu_id: "m2", comedor_id: "k2", cantidad: 80, estado: "recogida", codigo: "EBBBBB-3333", dni: "11111111", beneficiario_id: "b1", categoria: "caso_social", subtipo: "adulto_mayor" },
        { menu_id: "m2", comedor_id: "k2", cantidad: 8, estado: "pendiente", codigo: "LBBBBB-4444", dni: "33333333", beneficiario_id: null, categoria: null, subtipo: null },
      ],
    });

    expect(report.week.label).toBe("19 al 24/10/2026");
    expect(report.coverage).toEqual({ withData: 2, total: 3 });

    const carmen = report.kitchens.find((k) => k.id === "k1")!;
    expect(carmen.prepared).toBe(100);
    expect(carmen.delivered).toBe(90);
    expect(carmen.leftover).toBe(10);
    expect(carmen.hasData).toBe(true);

    const cristo = report.kitchens.find((k) => k.id === "k2")!;
    expect(cristo.prepared).toBe(100);
    expect(cristo.delivered).toBe(80);

    const villa = report.kitchens.find((k) => k.id === "k3")!;
    expect(villa.hasData).toBe(false);

    expect(report.totals.prepared).toBe(200);
    expect(report.totals.delivered).toBe(170);
    expect(report.totals.leftover).toBe(30);
    expect(report.channels).toEqual({ padron: 130, libre: 40 });
    expect(report.uniquePeople).toEqual({ group: 2, sumKitchens: 3 });
    expect(report.categories.find((c) => c.label === "Familia de socia")?.servings).toBe(50);
    expect(report.categories.find((c) => c.label === "Adulto mayor")?.servings).toBe(80);
    expect(report.leftoverKg).toBe(10);
    expect(formatG1Number(5990)).toBe("5 990");
  });
});
