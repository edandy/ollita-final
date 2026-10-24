import { friendlySupabaseError } from "./supabase-errors";

export type GroupMembership = {
  groupId: string;
  kitchenId: string;
};

export function validateGroupName(value: string) {
  const name = value.trim();
  if (!name) throw new Error("Escribe el nombre del grupo.");
  return name;
}

export function uniqueKitchenIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function uniqueGroupIds(ids: string[]) {
  return uniqueKitchenIds(ids);
}

export function kitchenCanBelongToManyGroups(memberships: GroupMembership[]) {
  const kitchens = new Set(memberships.map((m) => m.kitchenId));
  const groups = new Set(memberships.map((m) => m.groupId));
  return kitchens.size < memberships.length && groups.size > 1;
}

export function assertNoDuplicateMemberships(memberships: GroupMembership[]) {
  const seen = new Set<string>();
  for (const m of memberships) {
    const key = `${m.groupId}:${m.kitchenId}`;
    if (seen.has(key)) throw new Error("Esa olla ya está en este grupo.");
    seen.add(key);
  }
}

export function friendlyGroupError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("duplicate") || text.includes("unique")) {
    return "Ya existe un grupo con ese nombre.";
  }
  return friendlySupabaseError(message);
}
