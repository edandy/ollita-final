import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateMemberships,
  friendlyGroupError,
  kitchenCanBelongToManyGroups,
  uniqueGroupIds,
  uniqueKitchenIds,
  validateGroupName,
} from "./groups";

describe("validateGroupName", () => {
  it("trims and requires a real name", () => {
    expect(validateGroupName("  VES Sur  ")).toBe("VES Sur");
    expect(() => validateGroupName("")).toThrow(/nombre/i);
    expect(() => validateGroupName("   ")).toThrow(/nombre/i);
  });
});

describe("membresía de ollas", () => {
  it("lets the same kitchen sit in more than one group", () => {
    expect(
      kitchenCanBelongToManyGroups([
        { groupId: "a", kitchenId: "olla-1" },
        { groupId: "b", kitchenId: "olla-1" },
      ]),
    ).toBe(true);
  });

  it("rejects a duplicated group+kitchen pair", () => {
    expect(() =>
      assertNoDuplicateMemberships([
        { groupId: "a", kitchenId: "olla-1" },
        { groupId: "a", kitchenId: "olla-1" },
      ]),
    ).toThrow(/ya está en este grupo/i);
  });

  it("dedupes kitchen ids when saving a group", () => {
    expect(uniqueKitchenIds(["olla-1", "olla-1", "", "olla-2"])).toEqual(["olla-1", "olla-2"]);
  });

  it("lets an olla keep several groups without duplicates", () => {
    expect(uniqueGroupIds(["g1", "g1", "", "g2"])).toEqual(["g1", "g2"]);
  });
});

describe("friendlyGroupError", () => {
  it("translates unique and RLS errors", () => {
    expect(friendlyGroupError("duplicate key value violates unique constraint")).toBe(
      "Ya existe un grupo con ese nombre.",
    );
    expect(friendlyGroupError('new row violates row-level security policy for table "groups"')).toBe(
      "No tienes permiso para hacer este cambio.",
    );
    expect(friendlyGroupError("Escribe el nombre del grupo.")).toBe("Escribe el nombre del grupo.");
  });
});
