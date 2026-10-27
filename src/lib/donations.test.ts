import { describe, expect, it } from "vitest";
import { friendlyDonationError, nextDonationCode, validateDonationCode, validateDonorName } from "./donations";

describe("validateDonorName", () => {
  it("trims and requires a real name", () => {
    expect(validateDonorName("  Alimentos Andinos S.A.C. ")).toBe("Alimentos Andinos S.A.C.");
    expect(() => validateDonorName(" ")).toThrow("Escribe el nombre del donante.");
  });
});

describe("validateDonationCode", () => {
  it("accepts D-YYYY-NNN in any case and normalizes it", () => {
    expect(validateDonationCode(" d-2026-044 ")).toBe("D-2026-044");
    expect(() => validateDonationCode("2026-44")).toThrow("Escribe el código del lote, por ejemplo D-2026-044.");
  });
});

describe("nextDonationCode", () => {
  it("follows the highest number of the year", () => {
    expect(nextDonationCode(["D-2026-041", "D-2026-044", "D-2025-120"], 2026)).toBe("D-2026-045");
    expect(nextDonationCode(["D-2025-120"], 2026)).toBe("D-2026-001");
  });
});

describe("friendlyDonationError", () => {
  it("names which unique value is repeated", () => {
    expect(friendlyDonationError('duplicate key value violates unique constraint "donations_code_upper_idx"')).toBe(
      "Ya existe un lote con ese código.",
    );
    expect(friendlyDonationError('duplicate key value violates unique constraint "donors_name_lower_idx"')).toBe(
      "Ya existe un donante con ese nombre.",
    );
    expect(friendlyDonationError('update or delete on table "donors" violates foreign key constraint')).toBe(
      "Este donante tiene lotes registrados. Elimina primero sus lotes.",
    );
  });
});
