import { describe, expect, it } from "vitest";
import { esDni, validarPin } from "./dni-cuenta";
import {
  G1_DEMO_KITCHEN_KEYS,
  G1_DEMO_KITCHEN_STAFF,
  G1_DEMO_PIN,
  G1_DEMO_RESERVED_DNIS,
} from "./g1-demo";

describe("acceso demo de cada olla", () => {
  it("gives every demo kitchen a presidenta with a login DNI and PIN", () => {
    expect(G1_DEMO_KITCHEN_STAFF.map((s) => s.kitchenKey)).toEqual([...G1_DEMO_KITCHEN_KEYS]);
    expect(() => validarPin(G1_DEMO_PIN)).not.toThrow();

    for (const staff of G1_DEMO_KITCHEN_STAFF) {
      expect(esDni(staff.dni)).toBe(true);
      expect(staff.telefono).toMatch(/^\d{9}$/);
      expect(staff.nombre.trim().length).toBeGreaterThan(0);
      expect(staff.cargo).toBe("presidenta");
    }
  });

  it("keeps staff DNIs unique and clear of padrón, libres and supervisors", () => {
    const staffDnis = G1_DEMO_KITCHEN_STAFF.map((s) => s.dni);
    expect(new Set(staffDnis).size).toBe(staffDnis.length);

    for (const dni of staffDnis) {
      expect(G1_DEMO_RESERVED_DNIS).not.toContain(dni);
    }
  });
});
