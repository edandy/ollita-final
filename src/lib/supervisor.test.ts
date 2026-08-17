import { describe, expect, it } from "vitest";
import {
  needsSupervisorFields,
  parsePlatformRole,
  validateCreatePlatformUser,
  validateUpdatePlatformUser,
} from "./supervisor";

describe("platform user type", () => {
  it("only supervisors need access and assigned kitchens", () => {
    expect(needsSupervisorFields("admin")).toBe(false);
    expect(needsSupervisorFields("supervisor")).toBe(true);
  });

  it("rejects an invalid platform role", () => {
    expect(() => parsePlatformRole("gestor")).toThrow(/tipo/i);
  });
});

describe("validateCreatePlatformUser", () => {
  const supervisor = {
    role: "supervisor",
    name: "Ana Supervisor",
    dni: "12345678",
    pin: "1234",
    phone: "987654321",
    accessLevel: "view",
    comedorIds: ["olla-1", "olla-2"],
  };

  const admin = {
    role: "admin",
    name: "Nora Admin",
    dni: "87654321",
    pin: "4321",
    phone: "",
  };

  it("creates a supervisor with kitchens and access", () => {
    expect(validateCreatePlatformUser({ ...supervisor, comedorIds: ["olla-1", "olla-1"] })).toEqual({
      role: "supervisor",
      name: "Ana Supervisor",
      dni: "12345678",
      pin: "1234",
      phone: "987654321",
      email: "12345678@socias.laollita.pe",
      password: "1234-12345678",
      accessLevel: "view",
      comedorIds: ["olla-1"],
    });
  });

  it("creates an admin without kitchens or access", () => {
    expect(validateCreatePlatformUser(admin)).toEqual({
      role: "admin",
      name: "Nora Admin",
      dni: "87654321",
      pin: "4321",
      phone: null,
      email: "87654321@socias.laollita.pe",
      password: "4321-87654321",
      accessLevel: null,
      comedorIds: [],
    });
  });

  it("requires kitchens and access only for supervisors", () => {
    expect(() => validateCreatePlatformUser({ ...supervisor, comedorIds: [] })).toThrow(/olla/);
    expect(() => validateCreatePlatformUser({ ...supervisor, accessLevel: "admin" })).toThrow(/acceso/);
    expect(() => validateCreatePlatformUser({ ...admin, comedorIds: [] })).not.toThrow();
  });

  it("requires name, dni and pin for both types", () => {
    expect(() => validateCreatePlatformUser({ ...admin, name: "  " })).toThrow(/nombre/);
    expect(() => validateCreatePlatformUser({ ...admin, dni: "123" })).toThrow(/DNI/);
    expect(() => validateCreatePlatformUser({ ...supervisor, pin: "12" })).toThrow(/PIN/);
  });

  it("rejects kitchen members", () => {
    expect(() => validateCreatePlatformUser({ ...admin, isKitchenMember: true })).toThrow(/integrante/);
    expect(() => validateCreatePlatformUser({ ...supervisor, isKitchenMember: true })).toThrow(/integrante/);
  });
});

describe("validateUpdatePlatformUser", () => {
  it("keeps supervisor kitchens and drops them for admins", () => {
    expect(validateUpdatePlatformUser({
      userId: "u1",
      name: "Ana",
      role: "supervisor",
      accessLevel: "full",
      comedorIds: ["olla-1"],
    }).accessLevel).toBe("full");
    expect(validateUpdatePlatformUser({
      userId: "u1",
      name: "Nora",
      role: "admin",
      accessLevel: "full",
      comedorIds: ["olla-1"],
    })).toEqual({
      userId: "u1",
      name: "Nora",
      role: "admin",
      accessLevel: null,
      comedorIds: [],
    });
  });
});
