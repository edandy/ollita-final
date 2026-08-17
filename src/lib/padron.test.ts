import { describe, expect, it } from "vitest";
import {
  canRemoveBeneficiary,
  friendlyCreateBeneficiaryError,
  padronStaffCargo,
  resolveKitchenAccountAction,
  staffToPadronRow,
  validateCreateBeneficiary,
  validateUpdateBeneficiary,
} from "./padron";

const valid = {
  nombre: " María Quispe ",
  dni: "12345678",
  pin: "1234",
  telefono: "987654321",
  categoria: "socia_familia",
  carga: "2",
  comedor_id: "olla-1",
};

describe("validateCreateBeneficiary", () => {
  it("normalizes a complete form", () => {
    expect(validateCreateBeneficiary(valid)).toEqual({
      nombre: "María Quispe",
      dni: "12345678",
      pin: "1234",
      phone: "987654321",
      categoria: "socia_familia",
      cargaFamiliar: 2,
      socialSubtype: null,
      validUntil: null,
      comedor_id: "olla-1",
    });
  });

  it("treats an empty phone as optional", () => {
    expect(validateCreateBeneficiary({ ...valid, telefono: "  " }).phone).toBeNull();
    expect(validateCreateBeneficiary({ ...valid, telefono: undefined }).phone).toBeNull();
  });

  it("requires a full name", () => {
    expect(() => validateCreateBeneficiary({ ...valid, nombre: "  " })).toThrow(/nombre completo/);
  });

  it("requires an 8-digit DNI", () => {
    expect(() => validateCreateBeneficiary({ ...valid, dni: "123" })).toThrow(/DNI debe tener 8 dígitos/);
  });

  it("requires a PIN of 4 to 8 digits", () => {
    expect(() => validateCreateBeneficiary({ ...valid, pin: "12" })).toThrow(/PIN debe tener entre 4 y 8 números/);
  });

  it("requires 9 digits when a phone is provided", () => {
    expect(() => validateCreateBeneficiary({ ...valid, telefono: "91111" })).toThrow(/celular debe tener 9 dígitos/);
  });

  it("rejects an invalid category", () => {
    expect(() => validateCreateBeneficiary({ ...valid, categoria: "otra" })).toThrow(/categoría/);
  });

  it("requires a social subtype for caso social", () => {
    expect(() => validateCreateBeneficiary({
      ...valid,
      categoria: "caso_social",
      subtipo: "",
    })).toThrow(/subtipo/);
  });

  it("requires a valid-until date when the social case is not adulto mayor", () => {
    expect(() => validateCreateBeneficiary({
      ...valid,
      categoria: "caso_social",
      subtipo: "madre_soltera",
      vigencia: "",
    })).toThrow(/vigencia/);
  });

  it("keeps vigencia empty for adulto mayor", () => {
    expect(validateCreateBeneficiary({
      ...valid,
      categoria: "caso_social",
      subtipo: "adulto_mayor",
    })).toMatchObject({
      categoria: "caso_social",
      socialSubtype: "adulto_mayor",
      validUntil: null,
    });
  });
});

describe("validateUpdateBeneficiary", () => {
  it("does not require a PIN", () => {
    const { pin: _pin, ...withoutPin } = valid;
    expect(validateUpdateBeneficiary({ ...withoutPin, id: "b-1" })).toMatchObject({
      id: "b-1",
      nombre: "María Quispe",
      dni: "12345678",
    });
  });
});

describe("resolveKitchenAccountAction", () => {
  const none = {
    memberInThisKitchen: false,
    memberInOtherKitchen: false,
    hasAuthUser: false,
    isSupervisor: false,
  };

  it("creates an account when the person is new", () => {
    expect(resolveKitchenAccountAction(none)).toBe("create");
  });

  it("skips when they already belong to this kitchen", () => {
    expect(resolveKitchenAccountAction({ ...none, memberInThisKitchen: true, hasAuthUser: true })).toBe("skip");
  });

  it("skips when they already belong to another kitchen", () => {
    expect(resolveKitchenAccountAction({ ...none, memberInOtherKitchen: true, hasAuthUser: true })).toBe("skip");
  });

  it("links an existing auth user who is not a kitchen member", () => {
    expect(resolveKitchenAccountAction({ ...none, hasAuthUser: true })).toBe("link");
  });

  it("rejects a supervisor so they are not added as a kitchen member", () => {
    expect(resolveKitchenAccountAction({ ...none, hasAuthUser: true, isSupervisor: true })).toBe("reject_supervisor");
  });

  it("still skips a supervisor who is somehow already in this kitchen", () => {
    expect(resolveKitchenAccountAction({
      ...none,
      memberInThisKitchen: true,
      hasAuthUser: true,
      isSupervisor: true,
    })).toBe("skip");
  });
});

describe("friendlyCreateBeneficiaryError", () => {
  it("translates the phone check constraint", () => {
    expect(friendlyCreateBeneficiaryError(
      'new row for relation "usuarios_comedor" violates check constraint "usuarios_comedor_telefono_chk"',
    )).toBe("El celular debe tener 9 dígitos");
  });

  it("translates the DNI check constraint", () => {
    expect(friendlyCreateBeneficiaryError("usuarios_comedor_dni_chk")).toBe("El DNI debe tener 8 dígitos");
  });

  it("translates a duplicated auth email", () => {
    expect(friendlyCreateBeneficiaryError("A user with this email address has already been registered")).toBe(
      "Este DNI ya tiene una cuenta",
    );
  });

  it("translates a unique violation as already in the padrón", () => {
    expect(friendlyCreateBeneficiaryError("duplicate key value violates unique constraint")).toBe(
      "Esta persona ya está en el padrón",
    );
  });

  it("keeps the supervisor message", () => {
    expect(friendlyCreateBeneficiaryError("Este DNI es supervisor y no puede ser integrante de una olla")).toBe(
      "Este DNI es supervisor y no puede ser integrante de una olla",
    );
  });

  it("falls back to a generic message", () => {
    expect(friendlyCreateBeneficiaryError("something exploded")).toBe(
      "No pudimos guardar a esta persona. Revisa los datos e inténtalo de nuevo.",
    );
  });

  it("translates deleting staff from the padrón", () => {
    expect(friendlyCreateBeneficiaryError("staff_in_padron")).toBe(
      "Esta persona es parte del personal. No se puede quitar del padrón.",
    );
  });
});

describe("staffToPadronRow", () => {
  it("builds a socia_familia row for a kitchen member", () => {
    expect(staffToPadronRow({
      comedor_id: "olla-1",
      nombre: " Rosa Huamán ",
      dni: "12345678",
      telefono: "987654321",
    })).toEqual({
      comedor_id: "olla-1",
      nombre_completo: "Rosa Huamán",
      dni: "12345678",
      telefono: "987654321",
      categoria: "socia_familia",
      carga_familiar: 0,
      subtipo_caso_social: null,
      vigencia_hasta: null,
      activo: true,
    });
  });

  it("requires an 8-digit DNI", () => {
    expect(() => staffToPadronRow({
      comedor_id: "olla-1",
      nombre: "Rosa",
      dni: "12",
    })).toThrow(/DNI debe tener 8 dígitos/);
  });
});

describe("canRemoveBeneficiary", () => {
  it("allows removing a socia or someone who is not staff", () => {
    expect(canRemoveBeneficiary("socia")).toBe(true);
    expect(canRemoveBeneficiary(null)).toBe(true);
  });

  it("blocks removing the president and other team cargos", () => {
    expect(canRemoveBeneficiary("presidenta")).toBe(false);
    expect(canRemoveBeneficiary("tesorera")).toBe(false);
  });
});

describe("padronStaffCargo", () => {
  it("returns team cargos to show in the padrón", () => {
    expect(padronStaffCargo("presidenta")).toBe("presidenta");
    expect(padronStaffCargo("tesorera")).toBe("tesorera");
  });

  it("hides socia and unknown cargos", () => {
    expect(padronStaffCargo("socia")).toBeNull();
    expect(padronStaffCargo(null)).toBeNull();
    expect(padronStaffCargo("otro")).toBeNull();
  });
});
