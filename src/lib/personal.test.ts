import { describe, expect, it } from "vitest";
import {
  friendlyAssignStaffError,
  friendlyCreateStaffError,
  validateAssignStaffFromPadron,
  validateCreateStaff,
} from "./personal";

const valid = {
  nombre: " Rosa Huamán ",
  dni: "12345678",
  pin: "1234",
  telefono: "987654321",
  cargo: "vocal",
  comedor_id: "olla-1",
};

describe("validateCreateStaff", () => {
  it("normalizes a complete form", () => {
    expect(validateCreateStaff(valid)).toEqual({
      nombre: "Rosa Huamán",
      dni: "12345678",
      pin: "1234",
      phone: "987654321",
      cargo: "vocal",
      comedor_id: "olla-1",
    });
  });

  it("treats an empty phone as optional", () => {
    expect(validateCreateStaff({ ...valid, telefono: "  " }).phone).toBeNull();
    expect(validateCreateStaff({ ...valid, telefono: undefined }).phone).toBeNull();
  });

  it("requires a full name", () => {
    expect(() => validateCreateStaff({ ...valid, nombre: "  " })).toThrow(/nombre completo/);
  });

  it("requires an 8-digit DNI", () => {
    expect(() => validateCreateStaff({ ...valid, dni: "123" })).toThrow(/DNI debe tener 8 dígitos/);
  });

  it("requires a PIN of 4 to 8 digits", () => {
    expect(() => validateCreateStaff({ ...valid, pin: "12" })).toThrow(/PIN debe tener entre 4 y 8 números/);
  });

  it("requires 9 digits when a phone is provided", () => {
    expect(() => validateCreateStaff({ ...valid, telefono: "91111" })).toThrow(/celular debe tener 9 dígitos/);
  });

  it("rejects an invalid cargo", () => {
    expect(() => validateCreateStaff({ ...valid, cargo: "presidenta" })).toThrow(/Elige un cargo/);
  });
});

describe("friendlyCreateStaffError", () => {
  it("translates the phone check constraint", () => {
    expect(friendlyCreateStaffError(
      'new row for relation "usuarios_comedor" violates check constraint "usuarios_comedor_telefono_chk"',
    )).toBe("El celular debe tener 9 dígitos");
  });

  it("translates the DNI check constraint", () => {
    expect(friendlyCreateStaffError("usuarios_comedor_dni_chk")).toBe("El DNI debe tener 8 dígitos");
  });

  it("translates a duplicated auth email", () => {
    expect(friendlyCreateStaffError("A user with this email address has already been registered")).toBe(
      "Este DNI ya tiene una cuenta",
    );
  });

  it("translates a unique violation", () => {
    expect(friendlyCreateStaffError("duplicate key value violates unique constraint")).toBe(
      "Esta persona ya está en el equipo",
    );
  });

  it("falls back to a generic message", () => {
    expect(friendlyCreateStaffError("something exploded")).toBe(
      "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.",
    );
  });
});

const assignValid = {
  beneficiary_id: " benef-1 ",
  cargo: "tesorera",
  comedor_id: "olla-1",
};

describe("validateAssignStaffFromPadron", () => {
  it("normalizes a complete assignment", () => {
    expect(validateAssignStaffFromPadron(assignValid)).toEqual({
      beneficiaryId: "benef-1",
      cargo: "tesorera",
      comedor_id: "olla-1",
    });
  });

  it("requires a beneficiary", () => {
    expect(() => validateAssignStaffFromPadron({ ...assignValid, beneficiary_id: "  " })).toThrow(/padrón/);
  });

  it("requires a kitchen", () => {
    expect(() => validateAssignStaffFromPadron({ ...assignValid, comedor_id: "" })).toThrow(/olla/);
  });

  it("rejects presidenta and socia", () => {
    expect(() => validateAssignStaffFromPadron({ ...assignValid, cargo: "presidenta" })).toThrow(/Elige un cargo/);
    expect(() => validateAssignStaffFromPadron({ ...assignValid, cargo: "socia" })).toThrow(/Elige un cargo/);
  });
});

describe("friendlyAssignStaffError", () => {
  it("keeps the missing-account message", () => {
    expect(friendlyAssignStaffError("Esta persona no tiene cuenta. Regístrala de nuevo en el padrón con un PIN.")).toBe(
      "Esta persona no tiene cuenta. Regístrala de nuevo en el padrón con un PIN.",
    );
  });

  it("keeps the missing-padron message", () => {
    expect(friendlyAssignStaffError("Esta persona no está en el padrón")).toBe(
      "Esta persona no está en el padrón",
    );
  });

  it("translates a unique violation", () => {
    expect(friendlyAssignStaffError("duplicate key value violates unique constraint")).toBe(
      "Esta persona ya está en el equipo",
    );
  });

  it("falls back to a generic message", () => {
    expect(friendlyAssignStaffError("something exploded")).toBe(
      "No pudimos asignar el cargo. Revisa los datos e inténtalo de nuevo.",
    );
  });
});
