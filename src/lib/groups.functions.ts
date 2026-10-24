import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { friendlyGroupError, uniqueGroupIds, uniqueKitchenIds, validateGroupName } from "@/lib/groups";

async function exigirAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(friendlyGroupError(error.message));
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

export async function replaceKitchenGroups(
  supabaseAdmin: any,
  kitchenId: string,
  groupIds: string[],
) {
  const ids = uniqueGroupIds(groupIds);
  const { error: delErr } = await supabaseAdmin.from("group_kitchens").delete().eq("comedor_id", kitchenId);
  if (delErr) throw new Error(friendlyGroupError(delErr.message));
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from("group_kitchens").insert(
    ids.map((group_id) => ({ group_id, comedor_id: kitchenId })),
  );
  if (error) throw new Error(friendlyGroupError(error.message));
}

export type GroupRow = {
  id: string;
  name: string;
  created_at: string;
  kitchenIds: string[];
};

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: groups, error: gErr }, { data: links, error: lErr }] = await Promise.all([
      supabaseAdmin.from("groups").select("id,name,created_at").order("name"),
      supabaseAdmin.from("group_kitchens").select("group_id,comedor_id"),
    ]);
    if (gErr) throw new Error(friendlyGroupError(gErr.message));
    if (lErr) throw new Error(friendlyGroupError(lErr.message));
    return (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      created_at: g.created_at,
      kitchenIds: (links ?? []).filter((l) => l.group_id === g.id).map((l) => l.comedor_id),
    })) satisfies GroupRow[];
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string; kitchenIds?: string[] }) => ({
    name: validateGroupName(d.name),
    kitchenIds: uniqueKitchenIds(d.kitchenIds ?? []),
  }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("groups").insert({ name: data.name }).select("id").single();
    if (error || !row) throw new Error(friendlyGroupError(error?.message ?? "No pudimos crear el grupo."));
    if (data.kitchenIds.length > 0) {
      const { error: linkErr } = await supabaseAdmin.from("group_kitchens").insert(
        data.kitchenIds.map((comedor_id) => ({ group_id: row.id, comedor_id })),
      );
      if (linkErr) throw new Error(friendlyGroupError(linkErr.message));
    }
    return { id: row.id };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; name: string; kitchenIds: string[] }) => {
    if (!d.id) throw new Error("Falta el grupo");
    return {
      id: d.id,
      name: validateGroupName(d.name),
      kitchenIds: uniqueKitchenIds(d.kitchenIds ?? []),
    };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("groups").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(friendlyGroupError(error.message));
    const { error: delErr } = await supabaseAdmin.from("group_kitchens").delete().eq("group_id", data.id);
    if (delErr) throw new Error(friendlyGroupError(delErr.message));
    if (data.kitchenIds.length > 0) {
      const { error: linkErr } = await supabaseAdmin.from("group_kitchens").insert(
        data.kitchenIds.map((comedor_id) => ({ group_id: data.id, comedor_id })),
      );
      if (linkErr) throw new Error(friendlyGroupError(linkErr.message));
    }
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => {
    if (!d.id) throw new Error("Falta el grupo");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("groups").delete().eq("id", data.id);
    if (error) throw new Error(friendlyGroupError(error.message));
    return { ok: true };
  });
