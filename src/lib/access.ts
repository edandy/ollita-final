export type AccessLevel = "view" | "full";
export type PostLoginPath = "/admin" | "/panel" | "/";
export type AdminSection = "ollas" | "nueva" | "gestores" | "usuarios" | "actividad";

export const SUPERVISOR_KITCHEN_STORAGE_KEY = "supervisor_comedor_id";
export const ADMIN_KITCHEN_STORAGE_KEY = "admin_comedor_id";

export const ADMIN_SECTION_PATHS = {
  ollas: "/admin",
  nueva: "/admin/nueva",
  gestores: "/admin/gestores",
  usuarios: "/admin/usuarios",
  actividad: "/admin/actividad",
} as const satisfies Record<AdminSection, string>;

export const ADMIN_SECTIONS: AdminSection[] = [
  "ollas",
  "nueva",
  "gestores",
  "usuarios",
  "actividad",
];

export function adminSectionPath(section: AdminSection) {
  return ADMIN_SECTION_PATHS[section];
}

export function adminSectionFromPath(pathname: string): AdminSection | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = (Object.entries(ADMIN_SECTION_PATHS) as [AdminSection, string][])
    .find(([, sectionPath]) => sectionPath === path);
  return match?.[0] ?? null;
}

export function resolvePostLoginPath(input: {
  isAdmin: boolean;
  isSupervisor: boolean;
  isKitchenMember: boolean;
}): PostLoginPath {
  if (input.isAdmin || input.isSupervisor) return "/admin";
  if (input.isKitchenMember) return "/panel";
  return "/";
}

export function assertCanBeSupervisor(input: { isKitchenMember: boolean }) {
  if (input.isKitchenMember) {
    throw new Error("Esa persona ya es integrante de una olla");
  }
}

export function canBeSupervisor(input: { isKitchenMember: boolean }) {
  return !input.isKitchenMember;
}

export function canViewKitchen(input: {
  isAdmin: boolean;
  memberKitchenIds: string[];
  assignedKitchenIds: string[];
  kitchenId: string;
}) {
  if (input.isAdmin) return true;
  if (input.memberKitchenIds.includes(input.kitchenId)) return true;
  return input.assignedKitchenIds.includes(input.kitchenId);
}

export function canWriteKitchen(input: {
  isAdmin: boolean;
  memberKitchenIds: string[];
  assignedKitchenIds: string[];
  supervisorAccessLevel: AccessLevel | null;
  kitchenId: string;
}) {
  if (input.isAdmin) return true;
  if (input.memberKitchenIds.includes(input.kitchenId)) return true;
  if (!input.assignedKitchenIds.includes(input.kitchenId)) return false;
  return input.supervisorAccessLevel === "full";
}

export function canOpenAdminSection(input: {
  isAdmin: boolean;
  isSupervisor: boolean;
  section: AdminSection;
}) {
  if (input.isAdmin) return true;
  if (input.isSupervisor) return input.section === "ollas";
  return false;
}

export function filterKitchensForAdminHome<T extends { id: string }>(
  kitchens: T[],
  input: { isAdmin: boolean; assignedKitchenIds: string[] },
) {
  if (input.isAdmin) return kitchens;
  const allowed = new Set(input.assignedKitchenIds);
  return kitchens.filter((kitchen) => allowed.has(kitchen.id));
}

export function isSupervisorReadOnly(accessLevel: AccessLevel | null | undefined) {
  return accessLevel === "view";
}
