import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { monthRange } from "@/lib/g3";
import { buildG5Report, type G5Kitchen, type G5Member, type G5Person, type G5Shift } from "@/lib/g5";
import { todayISO } from "@/lib/dates";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { fetchAllRows } from "@/lib/supabase-paging";

function friendly(e: unknown): never {
  throw new Error(friendlySupabaseError(e instanceof Error ? e.message : String(e)));
}

/** Loads and builds G5 for these kitchens; G7 reuses its hours and board figures. */
export async function loadG5Report(
  supabaseAdmin: any,
  input: { groupName: string; monthStart: string; today: string; kitchenIds: string[] },
) {
  const { kitchenIds } = input;
  const month = monthRange(input.monthStart);
  const [kitchens, members, people, shifts, assignments] = await Promise.all([
    fetchAllRows<G5Kitchen>((f, t) =>
      supabaseAdmin.from("comedores").select("id,nombre,dias_atencion").in("id", kitchenIds).order("id").range(f, t),
    ),
    fetchAllRows<G5Member>((f, t) =>
      supabaseAdmin
        .from("usuarios_comedor")
        .select("comedor_id,cargo,dni")
        .in("comedor_id", kitchenIds)
        .order("id")
        .range(f, t),
    ),
    fetchAllRows<G5Person>((f, t) =>
      supabaseAdmin
        .from("beneficiarios")
        .select("comedor_id,dni,sex")
        .in("comedor_id", kitchenIds)
        .not("sex", "is", null)
        .order("id")
        .range(f, t),
    ),
    fetchAllRows<G5Shift>((f, t) =>
      supabaseAdmin
        .from("cronograma")
        .select("comedor_id,fecha,socias")
        .in("comedor_id", kitchenIds)
        .gte("fecha", month.from)
        .lte("fecha", month.to)
        .order("id")
        .range(f, t),
    ),
    fetchAllRows<{ comedor_id: string }>((f, t) =>
      supabaseAdmin
        .from("supervisor_assignments")
        .select("comedor_id")
        .in("comedor_id", kitchenIds)
        .order("id")
        .range(f, t),
    ),
  ]).catch(friendly);

  const byId = new Map(kitchens.map((k) => [k.id, k]));
  return buildG5Report({
    groupName: input.groupName,
    monthStart: input.monthStart,
    today: input.today,
    kitchens: kitchenIds.map((id) => byId.get(id) ?? { id, nombre: "Olla", dias_atencion: [] }),
    members,
    people,
    shifts,
    supervisedKitchenIds: assignments.map((a) => a.comedor_id),
  });
}

/** Returns counts only: no socia names leave the server. */
export const getG5Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; monthStart: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.monthStart ?? "")) throw new Error("Elige un mes");
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
    const base = { groupName: group.name, monthStart: data.monthStart, today: todayISO() };

    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG5Report({
          ...base,
          kitchens: [],
          members: [],
          people: [],
          shifts: [],
          supervisedKitchenIds: [],
        }),
      };
    }

    return { emptyMessage: null, report: await loadG5Report(supabaseAdmin, { ...base, kitchenIds }) };
  });
