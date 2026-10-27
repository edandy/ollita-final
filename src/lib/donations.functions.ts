import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  friendlyDonationError,
  validateDonationCode,
  validateDonorName,
  type DonationRow,
  type DonorRow,
} from "@/lib/donations";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";

async function exigirAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(friendlyDonationError(error.message));
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendlyDonationError(error.message));
}

/** Kitchens that recorded a share of each lot. */
async function kitchensByDonation(supabaseAdmin: any, donationIds: string[]) {
  const out = new Map<string, Set<string>>();
  if (donationIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from("movimientos_insumo")
    .select("donation_id,insumos(comedor_id)")
    .in("donation_id", donationIds)
    .eq("tipo", "ingreso");
  fail(error);
  for (const r of data ?? []) {
    const set = out.get(r.donation_id) ?? new Set<string>();
    if (r.insumos?.comedor_id) set.add(r.insumos.comedor_id);
    out.set(r.donation_id, set);
  }
  return out;
}

export const listDonors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: donors, error }, { data: lots, error: lErr }] = await Promise.all([
      supabaseAdmin.from("donors").select("id,name").order("name"),
      supabaseAdmin.from("donations").select("donor_id"),
    ]);
    fail(error);
    fail(lErr);
    return (donors ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      donations: (lots ?? []).filter((l) => l.donor_id === d.id).length,
    })) satisfies DonorRow[];
  });

export const saveDonor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id?: string; name: string }) => ({ id: d.id || null, name: validateDonorName(d.name) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = data.id
      ? await supabaseAdmin.from("donors").update({ name: data.name }).eq("id", data.id)
      : await supabaseAdmin.from("donors").insert({ name: data.name });
    fail(error);
    return { ok: true };
  });

export const deleteDonor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => {
    if (!d.id) throw new Error("Falta el donante");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("donors").delete().eq("id", data.id);
    fail(error);
    return { ok: true };
  });

async function loadDonations(supabaseAdmin: any, groupId?: string): Promise<DonationRow[]> {
  let query = supabaseAdmin
    .from("donations")
    .select("id,code,donor_id,group_id,received_on,donors(name),groups(name)")
    .order("received_on", { ascending: false })
    .order("code", { ascending: false });
  if (groupId) query = query.eq("group_id", groupId);
  const { data, error } = await query;
  fail(error);
  const kitchens = await kitchensByDonation(
    supabaseAdmin,
    (data ?? []).map((d: { id: string }) => d.id),
  );
  return (data ?? []).map((d: any) => ({
    id: d.id,
    code: d.code,
    donorId: d.donor_id,
    donorName: d.donors?.name ?? "Donante",
    groupId: d.group_id,
    groupName: d.groups?.name ?? "Grupo",
    receivedOn: d.received_on,
    kitchens: kitchens.get(d.id)?.size ?? 0,
  }));
}

export const listDonations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadDonations(supabaseAdmin);
  });

export const saveDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id?: string; code: string; donorId: string; groupId: string; receivedOn: string }) => {
    if (!d.donorId) throw new Error("Elige el donante.");
    if (!d.groupId) throw new Error("Elige el grupo que recibe la donación.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.receivedOn ?? "")) throw new Error("Indica la fecha en que llegó.");
    return {
      id: d.id || null,
      code: validateDonationCode(d.code),
      donorId: d.donorId,
      groupId: d.groupId,
      receivedOn: d.receivedOn,
    };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = { code: data.code, donor_id: data.donorId, group_id: data.groupId, received_on: data.receivedOn };
    const { error } = data.id
      ? await supabaseAdmin.from("donations").update(row).eq("id", data.id)
      : await supabaseAdmin.from("donations").insert(row);
    fail(error);
    return { ok: true };
  });

export const deleteDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => {
    if (!d.id) throw new Error("Falta el lote");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("donations").delete().eq("id", data.id);
    fail(error);
    return { ok: true };
  });

/** Lots of a group for G8, newest first; a supervisor only sees the group if it has her kitchens. */
export const listReportDonations = createServerFn({ method: "POST" })
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
    if (visible.length === 0) return [];
    return (await loadDonations(supabaseAdmin, data.groupId)).map(({ id, code, donorName, receivedOn }) => ({
      id,
      code,
      donorName,
      receivedOn,
    }));
  });
