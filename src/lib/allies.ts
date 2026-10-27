import { friendlySupabaseError } from "./supabase-errors";

export type AllyRow = {
  id: string;
  name: string;
  kitchenIds: string[];
};

export function validateAllyName(value: string) {
  const name = value.trim();
  if (!name) throw new Error("Escribe el nombre del aliado.");
  return name;
}

/** Allies that support at least one of these kitchens, each narrowed to those kitchens. */
export function alliesForKitchens(allies: AllyRow[], kitchenIds: string[]): AllyRow[] {
  const visible = new Set(kitchenIds);
  return allies
    .map((a) => ({ ...a, kitchenIds: a.kitchenIds.filter((id) => visible.has(id)) }))
    .filter((a) => a.kitchenIds.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function friendlyAllyError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("duplicate") || text.includes("unique")) {
    return "Ya existe un aliado con ese nombre.";
  }
  return friendlySupabaseError(message);
}
