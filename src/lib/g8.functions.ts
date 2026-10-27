import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import {
  buildG8Report,
  type G8Kitchen,
  type G8Menu,
  type G8Movement,
  type G8Pickup,
  type G8Supply,
  type G8Version,
} from "@/lib/g8";
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

/** One donation lot: the donor version letters the kitchens, the supervision version names them. */
export const getG8Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; donationId: string; version: G8Version }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!d.donationId) throw new Error("Elige un lote de donación");
    return { ...d, version: d.version === "supervision" ? ("supervision" as const) : ("donor" as const) };
  })
  .handler(async ({ data, context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const group = (await loadGroups(supabaseAdmin)).find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");
    const { data: lot, error: lotErr } = await supabaseAdmin
      .from("donations")
      .select("id,code,received_on,group_id,donors(name)")
      .eq("id", data.donationId)
      .maybeSingle();
    if (lotErr) friendly(lotErr);
    if (!lot || lot.group_id !== group.id) throw new Error("No encontramos ese lote en este grupo.");

    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    const kitchenIds = kitchensForG1({ groupKitchenIds: group.kitchenIds, assignedKitchenIds: assigned, isAdmin: admin });
    const today = todayISO();
    const base = {
      donation: { id: lot.id, code: lot.code, receivedOn: lot.received_on },
      donorName: (lot as any).donors?.name ?? "Donante",
      groupName: group.name,
      groupKitchenCount: kitchenIds.length,
      version: data.version,
      today,
    };
    const empty = { kitchens: [], supplies: [], movements: [], menus: [], pickups: [] };
    if (kitchenIds.length === 0) {
      return { emptyMessage: "Este grupo no tiene ollas que puedas ver.", report: buildG8Report({ ...base, ...empty }) };
    }

    // The lot's entries, then everything else about those supplies since the first one.
    const entries = await fetchAllRows<G8Movement>((f, t) =>
      supabaseAdmin
        .from("movimientos_insumo")
        .select("insumo_id,tipo,cantidad,fecha,donation_id")
        .eq("donation_id", lot.id)
        .order("id")
        .range(f, t),
    ).catch(friendly);
    const supplies: G8Supply[] = [];
    for (const ids of chunks([...new Set(entries.map((e) => e.insumo_id))])) {
      const rows = await fetchAllRows<G8Supply>((f, t) =>
        supabaseAdmin
          .from("insumos")
          .select("id,comedor_id,nombre,unidad")
          .in("id", ids)
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      supplies.push(...rows);
    }
    if (supplies.length === 0) {
      return {
        emptyMessage: "Ningún comedor que puedas ver registró todavía su parte de este lote.",
        report: buildG8Report({ ...base, ...empty }),
      };
    }

    const start = entries.reduce((m, e) => (e.fecha < m ? e.fecha : m), entries[0]!.fecha);
    const movements: G8Movement[] = [];
    for (const ids of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<G8Movement>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,donation_id")
          .in("insumo_id", ids)
          .gte("fecha", start)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(...rows.map((m) => ({ ...m, cantidad: Number(m.cantidad) || 0 })));
    }

    const withShare = [...new Set(supplies.map((s) => s.comedor_id))];
    const [kitchens, menus] = await Promise.all([
      fetchAllRows<G8Kitchen>((f, t) =>
        supabaseAdmin.from("comedores").select("id,nombre,foto_url").in("id", withShare).order("id").range(f, t),
      ),
      fetchAllRows<G8Menu>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id,comedor_id,fecha,nombre_plato,foto_url")
          .in("comedor_id", withShare)
          .eq("publicado", true)
          .gte("fecha", start)
          .lte("fecha", today)
          .order("id")
          .range(f, t),
      ),
    ]).catch(friendly);

    const pickups: G8Pickup[] = [];
    for (const ids of chunks(menus.map((m) => m.id))) {
      const rows = await fetchAllRows<G8Pickup>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("menu_id,comedor_id,cantidad,dni,beneficiario_id")
          .in("menu_id", ids)
          .eq("estado", "recogida")
          .order("id")
          .range(f, t),
      ).catch(friendly);
      pickups.push(...rows.map((r) => ({ ...r, cantidad: Number(r.cantidad) || 0 })));
    }

    return {
      emptyMessage: null,
      report: buildG8Report({ ...base, kitchens, supplies, movements, menus, pickups }),
    };
  });
