import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  generateKitchenCode,
  generateReservationCode,
  isKitchenCode,
  isUniqueViolation,
  sortReservasForPanel,
} from "./reservas";

describe("sortReservasForPanel", () => {
  it("puts pendientes first and entregadas last", () => {
    const rows = [
      { id: "e1", estado: "recogida", created_at: "2026-08-17T12:00:00Z" },
      { id: "p1", estado: "pendiente", created_at: "2026-08-17T10:00:00Z" },
      { id: "n1", estado: "no_recogida", created_at: "2026-08-17T11:00:00Z" },
      { id: "p2", estado: "pendiente", created_at: "2026-08-17T13:00:00Z" },
    ];
    expect(sortReservasForPanel(rows).map((r) => r.id)).toEqual(["p2", "p1", "n1", "e1"]);
  });

  it("keeps newer reservations first within the same status", () => {
    const rows = [
      { id: "old", estado: "pendiente", created_at: "2026-08-17T08:00:00Z" },
      { id: "new", estado: "pendiente", created_at: "2026-08-17T14:00:00Z" },
    ];
    expect(sortReservasForPanel(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

const alphabetRe = new RegExp(`^[${CODE_ALPHABET}]+$`);

describe("isKitchenCode", () => {
  it("accepts a 5-character alphabet code", () => {
    expect(isKitchenCode("7K3P2")).toBe(true);
    expect(isKitchenCode("ABCDE")).toBe(true);
  });

  it("rejects missing or malformed values", () => {
    expect(isKitchenCode(undefined)).toBe(false);
    expect(isKitchenCode("")).toBe(false);
    expect(isKitchenCode("M-ABC")).toBe(false);
    expect(isKitchenCode("ABC1E")).toBe(false);
  });
});

describe("generateKitchenCode", () => {
  it("returns 5 characters from the shared alphabet", () => {
    const code = generateKitchenCode();
    expect(code).toHaveLength(5);
    expect(code).toMatch(alphabetRe);
  });
});

describe("generateReservationCode", () => {
  it("uses E plus the kitchen code for enrolled people", () => {
    const code = generateReservationCode({ kitchenCode: "7K3P2", enrolled: true });
    expect(code).toMatch(new RegExp(`^E7K3P2-[${CODE_ALPHABET}]{4}$`));
  });

  it("uses L plus the kitchen code for walk-in people", () => {
    const code = generateReservationCode({ kitchenCode: "7K3P2", enrolled: false });
    expect(code).toMatch(new RegExp(`^L7K3P2-[${CODE_ALPHABET}]{4}$`));
  });
});

describe("isUniqueViolation", () => {
  it("detects postgres unique errors on reservation and kitchen codes", () => {
    expect(isUniqueViolation('duplicate key value violates unique constraint "reservas_codigo_key"')).toBe(true);
    expect(isUniqueViolation('duplicate key value violates unique constraint "comedores_code_key"')).toBe(true);
    expect(isUniqueViolation("No hay raciones")).toBe(false);
  });
});
