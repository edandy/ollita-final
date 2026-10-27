import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAllies } from "@/lib/allies.functions";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { monthRange } from "@/lib/g3";
import { loadG5Report } from "@/lib/g5.functions";
import {
  buildG7Report,
  type G7Kitchen,
  type G7Menu,
  type G7Movement,
  type G7Person,
  type G7Pickup,
  type G7Supply,
} from "@/lib/g7";
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

/** Group totals for an ally: no kitchen or person names leave the server. */
export const getG7Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; allyId?: string | null; monthStart: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.monthStart ?? "")) throw new Error("Elige un mes");
    return { groupId: d.groupId, allyId: d.allyId || null, monthStart: d.monthStart };
  })
  .handler(async ({ data, context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const group = (await loadGroups(supabaseAdmin)).find((g) => g.id === data.groupId);
    if (!group) throw new Error("No encontramos ese grupo.");

    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    let kitchenIds = kitchensForG1({ groupKitchenIds: group.kitchenIds, assignedKitchenIds: assigned, isAdmin: admin });
    let allyName: string | null = null;
    if (data.allyId) {
      const ally = (await loadAllies(supabaseAdmin)).find((a) => a.id === data.allyId);
      if (!ally) throw new Error("No encontramos ese aliado.");
      allyName = ally.name;
      const supported = new Set(ally.kitchenIds);
      kitchenIds = kitchenIds.filter((id) => supported.has(id));
    }

    const today = todayISO();
    const base = { groupName: group.name, allyName, monthStart: data.monthStart, today };
    const team = { hours: 0, sociasEnTurnos: 0, womenRate: null };
    if (kitchenIds.length === 0) {
      return {
        emptyMessage: data.allyId
          ? "Este aliado no apoya ollas de este grupo que puedas ver."
          : admin
            ? "Este grupo aún no tiene ollas."
            : "Este grupo no tiene ollas que puedas ver.",
        report: buildG7Report({
          ...base,
          kitchens: [],
          menus: [],
          pickups: [],
          people: [],
          supplies: [],
          movements: [],
          team,
        }),
      };
    }

    const month = monthRange(data.monthStart);
    const [kitchens, menus, people, supplies, g5] = await Promise.all([
      fetchAllRows<G7Kitchen>((f, t) =>
        supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds).order("id").range(f, t),
      ),
      fetchAllRows<G7Menu>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id,comedor_id,fecha")
          .in("comedor_id", kitchenIds)
          .eq("publicado", true)
          .gte("fecha", month.from)
          .lte("fecha", month.to)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G7Person>((f, t) =>
        supabaseAdmin
          .from("beneficiarios")
          .select("id,comedor_id,dni,care_group,carga_familiar")
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ),
      fetchAllRows<G7Supply>((f, t) =>
        supabaseAdmin
          .from("insumos")
          .select("id,comedor_id,unidad,origen,stock_actual")
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ),
      loadG5Report(supabaseAdmin, { groupName: group.name, monthStart: data.monthStart, today, kitchenIds }),
    ]).catch(friendly);

    const pickups: G7Pickup[] = [];
    for (const ids of chunks(menus.map((m) => m.id))) {
      const rows = await fetchAllRows<G7Pickup>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("menu_id,comedor_id,cantidad,codigo,dni,beneficiario_id")
          .in("menu_id", ids)
          .eq("estado", "recogida")
          .order("id")
          .range(f, t),
      ).catch(friendly);
      pickups.push(...rows.map((r) => ({ ...r, cantidad: Number(r.cantidad) || 0 })));
    }

    // Everything since the month start: the month's deliveries plus what rebuilds the stock day by day.
    const movements: G7Movement[] = [];
    for (const ids of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<G7Movement>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,donation_id")
          .in("insumo_id", ids)
          .gte("fecha", month.from)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(...rows.map((m) => ({ ...m, cantidad: Number(m.cantidad) || 0 })));
    }

    const byId = new Map(kitchens.map((k) => [k.id, k]));
    return {
      emptyMessage: null,
      report: buildG7Report({
        ...base,
        kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla" }),
        menus,
        pickups,
        people: people.map((p) => ({ ...p, carga_familiar: Number(p.carga_familiar) || 0 })),
        supplies: supplies.map((s) => ({ ...s, stock_actual: Number(s.stock_actual) || 0 })),
        movements,
        team: {
          hours: g5.hours,
          sociasEnTurnos: g5.roles.sociasEnTurnos,
          womenRate: g5.women.known ? g5.women.rate : null,
        },
      }),
    };
  });
