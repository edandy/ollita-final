import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1, shiftWeek, weekRangeMonSat } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { G2_USAGE_WINDOW_DAYS, g2Cutoff } from "@/lib/g2";
import { buildG10Report, type G10Kitchen, type G10Movement, type G10Supply, type G10Transfer } from "@/lib/g10";
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

export const getG10Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; weekStart: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.weekStart ?? "")) throw new Error("Elige una semana");
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
    const base = { groupName: group.name, weekStart: data.weekStart, today };
    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG10Report({ ...base, kitchens: [], supplies: [], movements: [], transfers: [] }),
      };
    }

    const week = weekRangeMonSat(data.weekStart);
    const cutoff = g2Cutoff(week.to, today);
    const previousWeek = weekRangeMonSat(shiftWeek(week.from, -1));
    const ids = kitchenIds.join(",");
    const [kitchens, supplies, transfers] = await Promise.all([
      fetchAllRows<G10Kitchen>((f, t) =>
        supabaseAdmin.from("comedores").select("id,nombre,raciones_diarias").in("id", kitchenIds).order("id").range(f, t),
      ),
      fetchAllRows<G10Supply>((f, t) =>
        supabaseAdmin
          .from("insumos")
          .select("id,comedor_id,nombre,unidad,stock_actual")
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G10Transfer>((f, t) =>
        supabaseAdmin
          .from("supply_transfers")
          .select("from_comedor_id,to_comedor_id,supply_name,unit,quantity,sent_on,status")
          .or(`from_comedor_id.in.(${ids}),to_comedor_id.in.(${ids})`)
          .gte("sent_on", previousWeek.from)
          .lte("sent_on", previousWeek.to)
          .order("id")
          .range(f, t),
      ),
    ]).catch(friendly);

    // The 30-day usage window, plus everything after the cutoff to rebuild the stock at that date.
    const movements: G10Movement[] = [];
    for (const chunk of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<G10Movement>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,transfer_id")
          .in("insumo_id", chunk)
          .gte("fecha", addDaysISO(cutoff, -(G2_USAGE_WINDOW_DAYS - 1)))
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(...rows.map((m) => ({ ...m, cantidad: Number(m.cantidad) || 0 })));
    }

    const byId = new Map(kitchens.map((k) => [k.id, k]));
    return {
      emptyMessage: null,
      report: buildG10Report({
        ...base,
        kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla", raciones_diarias: 0 }),
        supplies: supplies.map((s) => ({ ...s, stock_actual: Number(s.stock_actual) || 0 })),
        movements,
        transfers: transfers.map((t) => ({ ...t, quantity: Number(t.quantity) || 0 })),
      }),
    };
  });
