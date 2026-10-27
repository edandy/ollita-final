import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1, weekRangeMonSat } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { G2_USAGE_WINDOW_DAYS, buildG2Report, g2Cutoff, type G2Movement, type G2Supply } from "@/lib/g2";
import { todayISO } from "@/lib/dates";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { fetchAllRows } from "@/lib/supabase-paging";

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const getG2Report = createServerFn({ method: "POST" })
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
    const today = todayISO();

    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG2Report({
          groupName: group.name,
          weekStart: data.weekStart,
          today,
          kitchens: [],
          supplies: [],
          movements: [],
        }),
      };
    }

    const [{ data: comedores, error: cErr }, { data: insumos, error: iErr }] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds),
      supabaseAdmin
        .from("insumos")
        .select("id,comedor_id,nombre,unidad,stock_actual,precio_referencial")
        .in("comedor_id", kitchenIds),
    ]);
    if (cErr) throw new Error(friendlySupabaseError(cErr.message));
    if (iErr) throw new Error(friendlySupabaseError(iErr.message));

    const supplies: G2Supply[] = (insumos ?? []).map((i: any) => ({
      id: i.id,
      comedor_id: i.comedor_id,
      nombre: i.nombre,
      unidad: i.unidad,
      stock_actual: Number(i.stock_actual) || 0,
      precio_referencial: i.precio_referencial == null ? null : Number(i.precio_referencial),
    }));

    // Outflows of the 30-day usage window, plus everything after the cutoff to rebuild the stock at that date.
    const cutoff = g2Cutoff(weekRangeMonSat(data.weekStart).to, today);
    const windowStart = addDaysISO(cutoff, -(G2_USAGE_WINDOW_DAYS - 1));
    let movements: G2Movement[] = [];
    if (supplies.length > 0) {
      const rows = await fetchAllRows<any>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,precio_unitario")
          .in(
            "insumo_id",
            supplies.map((s) => s.id),
          )
          .gte("fecha", windowStart)
          .order("id")
          .range(f, t),
      ).catch((e: Error) => {
        throw new Error(friendlySupabaseError(e.message));
      });
      movements = rows.map((m: any) => ({
        insumo_id: m.insumo_id,
        tipo: m.tipo,
        cantidad: Number(m.cantidad) || 0,
        fecha: m.fecha,
        precio_unitario: m.precio_unitario == null ? null : Number(m.precio_unitario),
      }));
    }

    const nombrePorId = new Map((comedores ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));
    return {
      emptyMessage: null,
      report: buildG2Report({
        groupName: group.name,
        weekStart: data.weekStart,
        today,
        kitchens: kitchenIds.map((id) => ({ id, nombre: nombrePorId.get(id) ?? "Olla" })),
        supplies,
        movements,
      }),
    };
  });
