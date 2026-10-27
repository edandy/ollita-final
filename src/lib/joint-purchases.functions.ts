import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadGroups } from "@/lib/g1.functions";
import { buildG11Report } from "@/lib/g11";
import { loadG11Inputs, loadJointPurchase } from "@/lib/g11.functions";
import { uniqueKitchenIds } from "@/lib/groups";
import { todayISO } from "@/lib/dates";
import { friendlySupabaseError } from "@/lib/supabase-errors";

async function exigirAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(friendlySupabaseError(error.message));
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(friendlySupabaseError(error.message));
}

function validMonth(d: { groupId: string; monthStart: string }) {
  if (!d.groupId) throw new Error("Elige un grupo");
  if (!/^\d{4}-\d{2}-01$/.test(d.monthStart ?? "")) throw new Error("Elige un mes");
}

/** The purchase of a group and month, with the list the almacenes call for. */
export const getJointPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; monthStart: string }) => {
    validMonth(d);
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const group = (await loadGroups(supabaseAdmin)).find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");
    const today = todayISO();
    const [inputs, purchase] = await Promise.all([
      loadG11Inputs(supabaseAdmin, group.kitchenIds, today),
      loadJointPurchase(supabaseAdmin, group.id, data.monthStart),
    ]);
    // Every kitchen with data takes part in the list, so prices can be set before choosing who joins.
    const all = buildG11Report({
      groupName: group.name,
      monthStart: data.monthStart,
      today,
      ...inputs,
      participantIds: null,
      negotiated: purchase?.negotiated ?? {},
    });
    const withData = new Set(
      inputs.supplies.filter((s) => s.origen === "comprado").map((s) => s.comedor_id),
    );
    return {
      saved: purchase != null,
      kitchens: inputs.kitchens.map((k) => ({
        id: k.id,
        nombre: k.nombre,
        hasData: withData.has(k.id),
        selected: purchase ? purchase.kitchenIds.includes(k.id) : withData.has(k.id),
      })),
      items: all.items.map(({ key, label, unit, quantity, currentPrice, negotiated }) => ({
        key,
        label,
        unit,
        quantity,
        currentPrice,
        negotiated,
      })),
    };
  });

export const saveJointPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      groupId: string;
      monthStart: string;
      kitchenIds: string[];
      prices: { supplyKey: string; label: string; unit: string; price: number | null }[];
    }) => {
      validMonth(d);
      const kitchenIds = uniqueKitchenIds(d.kitchenIds ?? []);
      if (kitchenIds.length === 0) throw new Error("Marca al menos un comedor que participa.");
      const prices = (d.prices ?? []).filter((p) => p.price != null && String(p.price) !== "");
      for (const p of prices) {
        if (!Number.isFinite(Number(p.price)) || Number(p.price) <= 0) {
          throw new Error(`El precio negociado de ${p.label} debe ser mayor que 0.`);
        }
      }
      return { groupId: d.groupId, monthStart: d.monthStart, kitchenIds, prices };
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: purchase, error } = await supabaseAdmin
      .from("joint_purchases")
      .upsert({ group_id: data.groupId, month: data.monthStart }, { onConflict: "group_id,month" })
      .select("id")
      .single();
    fail(error);
    const purchaseId = purchase!.id;
    const [{ error: delKErr }, { error: delPErr }] = await Promise.all([
      supabaseAdmin.from("joint_purchase_kitchens").delete().eq("purchase_id", purchaseId),
      supabaseAdmin.from("joint_purchase_prices").delete().eq("purchase_id", purchaseId),
    ]);
    fail(delKErr);
    fail(delPErr);
    const { error: kErr } = await supabaseAdmin
      .from("joint_purchase_kitchens")
      .insert(data.kitchenIds.map((comedor_id) => ({ purchase_id: purchaseId, comedor_id })));
    fail(kErr);
    if (data.prices.length > 0) {
      const { error: pErr } = await supabaseAdmin.from("joint_purchase_prices").insert(
        data.prices.map((p) => ({
          purchase_id: purchaseId,
          supply_key: p.supplyKey,
          label: p.label,
          unit: p.unit as "kg" | "L" | "unid",
          negotiated_price: Number(p.price),
        })),
      );
      fail(pErr);
    }
    return { ok: true };
  });
