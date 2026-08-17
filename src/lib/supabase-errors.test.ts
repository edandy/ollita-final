import { describe, expect, it } from "vitest";
import { friendlySupabaseError } from "./supabase-errors";

describe("friendlySupabaseError", () => {
  it("maps RLS violations to a permission message", () => {
    expect(
      friendlySupabaseError('new row violates row-level security policy for table "transacciones"'),
    ).toBe("No tienes permiso para hacer este cambio.");
  });

  it("maps duplicate key errors", () => {
    expect(friendlySupabaseError("duplicate key value violates unique constraint")).toBe(
      "Ese registro ya existe.",
    );
  });

  it("maps invalid enum values", () => {
    expect(friendlySupabaseError('invalid input value for enum app_role: "supervisor"')).toBe(
      "Hay un dato incompatible. Contacta al soporte si persiste.",
    );
  });

  it("falls back for technical messages", () => {
    expect(friendlySupabaseError("column foo does not exist")).toBe(
      "No pudimos completar la acción. Inténtalo de nuevo.",
    );
  });

  it("preserves user-facing Spanish validation messages", () => {
    expect(friendlySupabaseError("Indica cuántas raciones vas a cocinar hoy.")).toBe(
      "Indica cuántas raciones vas a cocinar hoy.",
    );
  });
});
