import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { G2_USAGE_WINDOW_DAYS } from "@/lib/g2";
import { G11_PRICE_WINDOW_DAYS, buildG11Report, type G11Kitchen, type G11Movement, type G11Supply } from "@/lib/g11";
import { todayISO } from "@/lib/dates";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { fetchAllRows } from "@/lib/supabase-paging";

const ID_CHUNK = 300;

function chunks<T>(items: T[]) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK));
  return out;
}

function friendly(e: unknown): never {
  throw new Error(friendlySupabaseError(e instanceof Error ? e.message : String(e)));
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Kitchens, supplies and 90 days of movements: enough for usage, stock and paid prices. */
export async function loadG11Inputs(supabaseAdmin: any, kitchenIds: string[], today: string) {
  if (kitchenIds.length === 0) return { kitchens: [], supplies: [], movements: [] };
  const [kitchens, supplies] = await Promise.all([
    fetchAllRows<G11Kitchen>((f, t) =>
      supabaseAdmin.from("comedores").select("id,nombre,dias_atencion").in("id", kitchenIds).order("id").range(f, t),
    ),
    fetchAllRows<G11Supply>((f, t) =>
      supabaseAdmin
        .from("insumos")
        .select("id,comedor_id,nombre,unidad,stock_actual,precio_referencial,origen")
        .in("comedor_id", kitchenIds)
        .order("id")
        .range(f, t),
    ),
  ]).catch(friendly);
  const from = addDaysISO(today, -Math.max(G11_PRICE_WINDOW_DAYS, G2_USAGE_WINDOW_DAYS));
  const movements: G11Movement[] = [];
  for (const ids of chunks(supplies.map((s) => s.id))) {
    const rows = await fetchAllRows<G11Movement>((f, t) =>
      supabaseAdmin
        .from("movimientos_insumo")
        .select("insumo_id,tipo,cantidad,fecha,precio_unitario,transfer_id,donation_id")
        .in("insumo_id", ids)
        .gte("fecha", from)
        .order("id")
        .range(f, t),
    ).catch(friendly);
    movements.push(
      ...rows.map((m) => ({
        ...m,
        cantidad: Number(m.cantidad) || 0,
        precio_unitario: m.precio_unitario == null ? null : Number(m.precio_unitario),
      })),
    );
  }
  const byId = new Map(kitchens.map((k) => [k.id, k]));
  return {
    kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla", dias_atencion: [] }),
    supplies: supplies.map((s) => ({
      ...s,
      stock_actual: Number(s.stock_actual) || 0,
      precio_referencial: s.precio_referencial == null ? null : Number(s.precio_referencial),
    })),
    movements,
  };
}

/** The saved purchase of a group and month, if any: its kitchens and negotiated prices. */
export async function loadJointPurchase(supabaseAdmin: any, groupId: string, monthStart: string) {
  const { data: purchase, error } = await supabaseAdmin
    .from("joint_purchases")
    .select("id")
    .eq("group_id", groupId)
    .eq("month", monthStart)
    .maybeSingle();
  if (error) friendly(error);
  if (!purchase) return null;
  const [{ data: kitchens, error: kErr }, { data: prices, error: pErr }] = await Promise.all([
    supabaseAdmin.from("joint_purchase_kitchens").select("comedor_id").eq("purchase_id", purchase.id),
    supabaseAdmin.from("joint_purchase_prices").select("supply_key,negotiated_price").eq("purchase_id", purchase.id),
  ]);
  if (kErr) friendly(kErr);
  if (pErr) friendly(pErr);
  return {
    id: purchase.id as string,
    kitchenIds: (kitchens ?? []).map((k: { comedor_id: string }) => k.comedor_id),
    negotiated: Object.fromEntries(
      (prices ?? []).map((p: { supply_key: string; negotiated_price: number }) => [p.supply_key, Number(p.negotiated_price)]),
    ) as Record<string, number>,
  };
}

export const getG11Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; monthStart: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!/^\d{4}-\d{2}-01$/.test(d.monthStart ?? "")) throw new Error("Elige un mes");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const group = (await loadGroups(supabaseAdmin)).find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");

    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    const kitchenIds = kitchensForG1({ groupKitchenIds: group.kitchenIds, assignedKitchenIds: assigned, isAdmin: admin });
    const today = todayISO();
    const [inputs, purchase] = await Promise.all([
      loadG11Inputs(supabaseAdmin, kitchenIds, today),
      loadJointPurchase(supabaseAdmin, group.id, data.monthStart),
    ]);
    const report = buildG11Report({
      groupName: group.name,
      monthStart: data.monthStart,
      today,
      ...inputs,
      participantIds: purchase ? purchase.kitchenIds.filter((id: string) => kitchenIds.includes(id)) : null,
      negotiated: purchase?.negotiated ?? {},
    });
    return {
      emptyMessage:
        kitchenIds.length === 0
          ? admin
            ? "Este grupo aún no tiene ollas."
            : "Este grupo no tiene ollas que puedas ver."
          : null,
      report,
    };
  });
