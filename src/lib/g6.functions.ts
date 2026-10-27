import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1, weekRangeMonSat } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { G2_USAGE_WINDOW_DAYS, g2Cutoff } from "@/lib/g2";
import {
  buildG6Report,
  type G6CashDay,
  type G6Kitchen,
  type G6Pending,
  type G6Person,
  type G6Supply,
} from "@/lib/g6";
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

export const getG6Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; weekStart: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.weekStart ?? "")) throw new Error("Elige una semana");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groups = await loadGroups(supabaseAdmin);
    const group = groups.find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");

    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    const kitchenIds = kitchensForG1({
      groupKitchenIds: group.kitchenIds,
      assignedKitchenIds: assigned,
      isAdmin: admin,
    });
    const base = { groupName: group.name, weekStart: data.weekStart, today: todayISO() };
    const empty = { kitchens: [], menus: [], cashDays: [], supplies: [], movements: [], people: [], pendingReservations: [] };

    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG6Report({ ...base, ...empty }),
      };
    }

    const week = weekRangeMonSat(data.weekStart);
    const cutoff = g2Cutoff(week.to, base.today);
    const [kitchens, menus, cashDays, supplies, people] = await Promise.all([
      fetchAllRows<G6Kitchen>((f, t) =>
        supabaseAdmin.from("comedores").select("id,nombre,dias_atencion").in("id", kitchenIds).order("id").range(f, t),
      ),
      fetchAllRows<{ id: string; comedor_id: string; fecha: string; publicado: boolean }>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id,comedor_id,fecha,publicado")
          .in("comedor_id", kitchenIds)
          .gte("fecha", week.from)
          .lte("fecha", week.to)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G6CashDay>((f, t) =>
        supabaseAdmin
          .from("caja_dias")
          .select("comedor_id,fecha,cerrado")
          .in("comedor_id", kitchenIds)
          .gte("fecha", week.from)
          .lte("fecha", week.to)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G6Supply>((f, t) =>
        supabaseAdmin
          .from("insumos")
          .select("id,comedor_id,nombre,stock_actual")
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G6Person>((f, t) =>
        supabaseAdmin
          .from("beneficiarios")
          .select("comedor_id,vigencia_hasta")
          .in("comedor_id", kitchenIds)
          .eq("activo", true)
          .lt("vigencia_hasta", cutoff)
          .order("id")
          .range(f, t),
      ),
    ]).catch(friendly);

    // Outflows of the 30-day usage window, plus everything after the cutoff to rebuild the stock at that date.
    const windowStart = addDaysISO(cutoff, -(G2_USAGE_WINDOW_DAYS - 1));
    const movements: { insumo_id: string; tipo: string; cantidad: number; fecha: string; transfer_id: string | null }[] = [];
    for (const ids of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<{ insumo_id: string; tipo: string; cantidad: number; fecha: string; transfer_id: string | null }>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,transfer_id")
          .in("insumo_id", ids)
          .gte("fecha", windowStart)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(...rows.map((m) => ({ ...m, cantidad: Number(m.cantidad) || 0 })));
    }

    const menuDate = new Map(menus.map((m) => [m.id, m.fecha]));
    const pendingReservations: G6Pending[] = [];
    for (const ids of chunks(menus.map((m) => m.id))) {
      const rows = await fetchAllRows<{ comedor_id: string; menu_id: string }>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("comedor_id,menu_id")
          .in("menu_id", ids)
          .eq("estado", "pendiente")
          .order("id")
          .range(f, t),
      ).catch(friendly);
      pendingReservations.push(...rows.map((r) => ({ comedor_id: r.comedor_id, fecha: menuDate.get(r.menu_id)! })));
    }

    const byId = new Map(kitchens.map((k) => [k.id, k]));
    return {
      emptyMessage: null,
      report: buildG6Report({
        ...base,
        kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla", dias_atencion: [] }),
        menus,
        cashDays,
        supplies: supplies.map((s) => ({ ...s, stock_actual: Number(s.stock_actual) || 0 })),
        movements,
        people,
        pendingReservations,
      }),
    };
  });
