import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { alliesForKitchens, friendlyAllyError, validateAllyName, type AllyRow } from "@/lib/allies";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { uniqueKitchenIds } from "@/lib/groups";

async function exigirAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(friendlyAllyError(error.message));
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

export async function loadAllies(supabaseAdmin: any): Promise<AllyRow[]> {
  const [{ data: allies, error: aErr }, { data: links, error: lErr }] = await Promise.all([
    supabaseAdmin.from("allies").select("id,name").order("name"),
    supabaseAdmin.from("ally_kitchens").select("ally_id,comedor_id"),
  ]);
  if (aErr) throw new Error(friendlyAllyError(aErr.message));
  if (lErr) throw new Error(friendlyAllyError(lErr.message));
  return (allies ?? []).map((a: { id: string; name: string }) => ({
    id: a.id,
    name: a.name,
    kitchenIds: (links ?? [])
      .filter((l: { ally_id: string }) => l.ally_id === a.id)
      .map((l: { comedor_id: string }) => l.comedor_id),
  }));
}

async function replaceAllyKitchens(supabaseAdmin: any, allyId: string, kitchenIds: string[]) {
  const { error: delErr } = await supabaseAdmin.from("ally_kitchens").delete().eq("ally_id", allyId);
  if (delErr) throw new Error(friendlyAllyError(delErr.message));
  if (kitchenIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("ally_kitchens")
    .insert(kitchenIds.map((comedor_id) => ({ ally_id: allyId, comedor_id })));
  if (error) throw new Error(friendlyAllyError(error.message));
}

export const listAllies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadAllies(supabaseAdmin);
  });

export const createAlly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string; kitchenIds?: string[] }) => ({
    name: validateAllyName(d.name),
    kitchenIds: uniqueKitchenIds(d.kitchenIds ?? []),
  }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("allies").insert({ name: data.name }).select("id").single();
    if (error || !row) throw new Error(friendlyAllyError(error?.message ?? "No pudimos crear el aliado."));
    await replaceAllyKitchens(supabaseAdmin, row.id, data.kitchenIds);
    return { id: row.id };
  });

export const updateAlly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; name: string; kitchenIds: string[] }) => {
    if (!d.id) throw new Error("Falta el aliado");
    return { id: d.id, name: validateAllyName(d.name), kitchenIds: uniqueKitchenIds(d.kitchenIds ?? []) };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("allies").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(friendlyAllyError(error.message));
    await replaceAllyKitchens(supabaseAdmin, data.id, data.kitchenIds);
    return { ok: true };
  });

export const deleteAlly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => {
    if (!d.id) throw new Error("Falta el aliado");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("allies").delete().eq("id", data.id);
    if (error) throw new Error(friendlyAllyError(error.message));
    return { ok: true };
  });

/** Allies with at least one kitchen of the group that this admin or supervisor can see. */
export const listReportAllies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const group = (await loadGroups(supabaseAdmin)).find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");
    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    const visible = kitchensForG1({ groupKitchenIds: group.kitchenIds, assignedKitchenIds: assigned, isAdmin: admin });
    return alliesForKitchens(await loadAllies(supabaseAdmin), visible).map(({ id, name }) => ({ id, name }));
  });
