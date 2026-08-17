import { describe, expect, it } from "vitest";
import {
  canBeSupervisor,
  canOpenAdminSection,
  canViewKitchen,
  canWriteKitchen,
  filterKitchensForAdminHome,
  isSupervisorReadOnly,
  resolvePostLoginPath,
  assertCanBeSupervisor,
  adminSectionPath,
  adminSectionFromPath,
  ADMIN_SECTIONS,
} from "./access";

describe("resolvePostLoginPath", () => {
  it("sends admin to /admin", () => {
    expect(resolvePostLoginPath({ isAdmin: true, isSupervisor: false, isKitchenMember: false })).toBe("/admin");
  });

  it("sends supervisor to /admin", () => {
    expect(resolvePostLoginPath({ isAdmin: false, isSupervisor: true, isKitchenMember: false })).toBe("/admin");
  });

  it("sends kitchen member to /panel", () => {
    expect(resolvePostLoginPath({ isAdmin: false, isSupervisor: false, isKitchenMember: true })).toBe("/panel");
  });

  it("sends everyone else home", () => {
    expect(resolvePostLoginPath({ isAdmin: false, isSupervisor: false, isKitchenMember: false })).toBe("/");
  });
});

describe("supervisor vs kitchen member", () => {
  it("rejects kitchen members as supervisors", () => {
    expect(canBeSupervisor({ isKitchenMember: true })).toBe(false);
    expect(() => assertCanBeSupervisor({ isKitchenMember: true })).toThrow(/integrante/);
  });

  it("allows users who are not kitchen members", () => {
    expect(canBeSupervisor({ isKitchenMember: false })).toBe(true);
    expect(() => assertCanBeSupervisor({ isKitchenMember: false })).not.toThrow();
  });
});

describe("kitchen access", () => {
  const kitchenId = "olla-1";

  it("lets an admin view and write any kitchen", () => {
    const base = { isAdmin: true, memberKitchenIds: [], assignedKitchenIds: [], kitchenId };
    expect(canViewKitchen(base)).toBe(true);
    expect(canWriteKitchen({ ...base, supervisorAccessLevel: null })).toBe(true);
  });

  it("lets a member view and write their own kitchen", () => {
    const base = { isAdmin: false, memberKitchenIds: [kitchenId], assignedKitchenIds: [], kitchenId };
    expect(canViewKitchen(base)).toBe(true);
    expect(canWriteKitchen({ ...base, supervisorAccessLevel: null })).toBe(true);
  });

  it("lets an assigned supervisor view a kitchen", () => {
    expect(canViewKitchen({
      isAdmin: false,
      memberKitchenIds: [],
      assignedKitchenIds: [kitchenId],
      kitchenId,
    })).toBe(true);
  });

  it("does not let a supervisor view an unassigned kitchen", () => {
    expect(canViewKitchen({
      isAdmin: false,
      memberKitchenIds: [],
      assignedKitchenIds: ["otra"],
      kitchenId,
    })).toBe(false);
  });

  it("blocks writes for view supervisors", () => {
    expect(canWriteKitchen({
      isAdmin: false,
      memberKitchenIds: [],
      assignedKitchenIds: [kitchenId],
      supervisorAccessLevel: "view",
      kitchenId,
    })).toBe(false);
    expect(isSupervisorReadOnly("view")).toBe(true);
  });

  it("allows writes for full supervisors on assigned kitchens only", () => {
    expect(canWriteKitchen({
      isAdmin: false,
      memberKitchenIds: [],
      assignedKitchenIds: [kitchenId],
      supervisorAccessLevel: "full",
      kitchenId,
    })).toBe(true);
    expect(canWriteKitchen({
      isAdmin: false,
      memberKitchenIds: [],
      assignedKitchenIds: [kitchenId],
      supervisorAccessLevel: "full",
      kitchenId: "otra",
    })).toBe(false);
    expect(isSupervisorReadOnly("full")).toBe(false);
  });
});

describe("admin module urls", () => {
  it("gives every module its own path", () => {
    expect(adminSectionPath("ollas")).toBe("/admin");
    expect(adminSectionPath("nueva")).toBe("/admin/nueva");
    expect(adminSectionPath("gestores")).toBe("/admin/gestores");
    expect(adminSectionPath("usuarios")).toBe("/admin/usuarios");
    expect(adminSectionPath("actividad")).toBe("/admin/actividad");
  });

  it("covers every admin section exactly once", () => {
    const paths = ADMIN_SECTIONS.map(adminSectionPath);
    expect(new Set(paths).size).toBe(ADMIN_SECTIONS.length);
  });

  it("reads the module from the pathname", () => {
    expect(adminSectionFromPath("/admin")).toBe("ollas");
    expect(adminSectionFromPath("/admin/")).toBe("ollas");
    expect(adminSectionFromPath("/admin/nueva")).toBe("nueva");
    expect(adminSectionFromPath("/admin/gestores")).toBe("gestores");
    expect(adminSectionFromPath("/admin/usuarios")).toBe("usuarios");
    expect(adminSectionFromPath("/admin/actividad")).toBe("actividad");
    expect(adminSectionFromPath("/panel")).toBe(null);
  });
});

describe("admin home for supervisors", () => {
  it("only opens the kitchens section", () => {
    expect(canOpenAdminSection({ isAdmin: false, isSupervisor: true, section: "ollas" })).toBe(true);
    expect(canOpenAdminSection({ isAdmin: false, isSupervisor: true, section: "nueva" })).toBe(false);
    expect(canOpenAdminSection({ isAdmin: false, isSupervisor: true, section: "gestores" })).toBe(false);
    expect(canOpenAdminSection({ isAdmin: false, isSupervisor: true, section: "usuarios" })).toBe(false);
    expect(canOpenAdminSection({ isAdmin: false, isSupervisor: true, section: "actividad" })).toBe(false);
  });

  it("lets admins open every section", () => {
    expect(canOpenAdminSection({ isAdmin: true, isSupervisor: false, section: "usuarios" })).toBe(true);
    expect(canOpenAdminSection({ isAdmin: true, isSupervisor: false, section: "nueva" })).toBe(true);
    expect(canOpenAdminSection({ isAdmin: true, isSupervisor: false, section: "gestores" })).toBe(true);
  });

  it("lists only assigned kitchens for supervisors", () => {
    const kitchens = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterKitchensForAdminHome(kitchens, { isAdmin: true, assignedKitchenIds: ["b"] })).toEqual(kitchens);
    expect(filterKitchensForAdminHome(kitchens, { isAdmin: false, assignedKitchenIds: ["b"] })).toEqual([{ id: "b" }]);
  });
});
