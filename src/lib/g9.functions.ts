import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1, shiftWeek, weekRangeMonSat } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { g2Cutoff } from "@/lib/g2";
import { monthRange } from "@/lib/g3";
import {
  G9_WEEKS,
  buildG9Report,
  type G9Activity,
  type G9CashDay,
  type G9Dated,
  type G9Kitchen,
  type G9Person,
  type G9Pickup,
  type G9Transaction,
} from "@/lib/g9";
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

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function earliest(...dates: string[]) {
  return dates.reduce((m, d) => (d < m ? d : m));
}

export const getG9Report = createServerFn({ method: "POST" })
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
    const base = { groupName: group.name, groupSince: group.created_at, weekStart: data.weekStart, today };
    const empty = {
      kitchens: [],
      activity: [],
      menus: [],
      cashDays: [],
      transactions: [],
      debts: [],
      pickups: [],
      pending: [],
      people: [],
      movements: [],
      shifts: [],
    };
    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG9Report({ ...base, ...empty }),
      };
    }

    const week = weekRangeMonSat(data.weekStart);
    const cutoff = g2Cutoff(week.to, today);
    const month = monthRange(cutoff);
    // The eight charted weeks, the last 30 days and the month of the cutoff.
    const from = earliest(shiftWeek(week.from, -(G9_WEEKS - 1)), addDays(cutoff, -29), month.from);
    const pickupsFrom = earliest(month.from, week.from);

    const [kitchens, activity, menus, cashDays, people, supplies, shifts, debts] = await Promise.all([
      fetchAllRows<G9Kitchen>((f, t) =>
        supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds).order("id").range(f, t),
      ),
      fetchAllRows<G9Activity>((f, t) =>
        supabaseAdmin
          .from("kitchen_activity")
          .select("user_id,comedor_id,day")
          .in("comedor_id", kitchenIds)
          .gte("day", addDays(cutoff, -13))
          .lte("day", cutoff)
          .order("day")
          .order("user_id")
          .range(f, t),
      ),
      fetchAllRows<{ id: string; comedor_id: string; fecha: string }>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id,comedor_id,fecha")
          .in("comedor_id", kitchenIds)
          .gte("fecha", from)
          .lte("fecha", cutoff)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G9CashDay>((f, t) =>
        supabaseAdmin
          .from("caja_dias")
          .select("id,comedor_id,fecha,cerrado,total_ingresos")
          .in("comedor_id", kitchenIds)
          .gte("fecha", from)
          .lte("fecha", cutoff)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G9Person>((f, t) =>
        supabaseAdmin
          .from("beneficiarios")
          .select("comedor_id,dni,nombre_completo")
          .in("comedor_id", kitchenIds)
          .eq("activo", true)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<{ id: string; comedor_id: string }>((f, t) =>
        supabaseAdmin.from("insumos").select("id,comedor_id").in("comedor_id", kitchenIds).order("id").range(f, t),
      ),
      fetchAllRows<G9Dated>((f, t) =>
        supabaseAdmin
          .from("cronograma")
          .select("comedor_id,fecha")
          .in("comedor_id", kitchenIds)
          .gte("fecha", from)
          .lte("fecha", cutoff)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<{ reservation_id: string | null }>((f, t) =>
        supabaseAdmin
          .from("debts")
          .select("reservation_id")
          .in("comedor_id", kitchenIds)
          .not("reservation_id", "is", null)
          .order("id")
          .range(f, t),
      ),
    ]).catch(friendly);

    const supplyKitchen = new Map(supplies.map((s) => [s.id, s.comedor_id]));
    const movements: G9Dated[] = [];
    for (const ids of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<{ insumo_id: string; fecha: string }>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,fecha")
          .in("insumo_id", ids)
          .gte("fecha", from)
          .lte("fecha", cutoff)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(...rows.map((m) => ({ comedor_id: supplyKitchen.get(m.insumo_id)!, fecha: m.fecha })));
    }

    const weekCashIds = cashDays.filter((c) => c.fecha >= week.from && c.fecha <= cutoff).map((c) => c.id);
    const transactions: G9Transaction[] = [];
    for (const ids of chunks(weekCashIds)) {
      const rows = await fetchAllRows<G9Transaction>((f, t) =>
        supabaseAdmin
          .from("transacciones")
          .select("caja_dia_id,tipo,categoria,monto,nota")
          .in("caja_dia_id", ids)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      transactions.push(...rows.map((r) => ({ ...r, monto: Number(r.monto) || 0 })));
    }

    const menuDate = new Map(menus.map((m) => [m.id, m.fecha]));
    const reservationMenus = menus.filter((m) => m.fecha >= pickupsFrom).map((m) => m.id);
    const pickups: G9Pickup[] = [];
    const pending: G9Dated[] = [];
    for (const ids of chunks(reservationMenus)) {
      const rows = await fetchAllRows<{
        id: string;
        menu_id: string;
        comedor_id: string;
        codigo: string;
        cantidad: number;
        estado: string;
        beneficiario_id: string | null;
      }>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("id,menu_id,comedor_id,codigo,cantidad,estado,beneficiario_id")
          .in("menu_id", ids)
          .in("estado", ["recogida", "pendiente"])
          .order("id")
          .range(f, t),
      ).catch(friendly);
      for (const r of rows) {
        const fecha = menuDate.get(r.menu_id)!;
        if (r.estado === "pendiente") pending.push({ comedor_id: r.comedor_id, fecha });
        else pickups.push({ ...r, cantidad: Number(r.cantidad) || 0, fecha });
      }
    }

    const byId = new Map(kitchens.map((k) => [k.id, k]));
    return {
      emptyMessage: null,
      report: buildG9Report({
        ...base,
        kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla" }),
        activity,
        menus: menus.map(({ comedor_id, fecha }) => ({ comedor_id, fecha })),
        cashDays: cashDays.map((c) => ({ ...c, total_ingresos: Number(c.total_ingresos) || 0 })),
        transactions,
        debts,
        pickups,
        pending,
        people,
        movements,
        shifts,
      }),
    };
  });
