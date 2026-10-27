import { describe, expect, it } from "vitest";
import { alliesForKitchens, friendlyAllyError, validateAllyName } from "./allies";

describe("validateAllyName", () => {
  it("trims and requires a real name", () => {
    expect(validateAllyName("  Red Solidaria Sur ")).toBe("Red Solidaria Sur");
    expect(() => validateAllyName("  ")).toThrow("Escribe el nombre del aliado.");
  });
});

describe("alliesForKitchens", () => {
  const allies = [
    { id: "a", name: "Red Solidaria Sur", kitchenIds: ["k1", "k2"] },
    { id: "b", name: "Asociación Manos Unidas", kitchenIds: ["k3"] },
    { id: "c", name: "Fundación Pan Compartido", kitchenIds: ["k2", "k9"] },
  ];

  it("keeps allies with a visible kitchen, sorted by name, with only those kitchens", () => {
    expect(alliesForKitchens(allies, ["k2", "k3"])).toEqual([
      { id: "b", name: "Asociación Manos Unidas", kitchenIds: ["k3"] },
      { id: "c", name: "Fundación Pan Compartido", kitchenIds: ["k2"] },
      { id: "a", name: "Red Solidaria Sur", kitchenIds: ["k2"] },
    ]);
    expect(alliesForKitchens(allies, [])).toEqual([]);
  });
});

describe("friendlyAllyError", () => {
  it("translates unique and RLS errors", () => {
    expect(friendlyAllyError('duplicate key value violates unique constraint "allies_name_lower_idx"')).toBe(
      "Ya existe un aliado con ese nombre.",
    );
    expect(friendlyAllyError('new row violates row-level security policy for table "allies"')).toBe(
      "No tienes permiso para hacer este cambio.",
    );
    expect(friendlyAllyError("Escribe el nombre del aliado.")).toBe("Escribe el nombre del aliado.");
  });
});
