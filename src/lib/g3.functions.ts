import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import type { G2Movement, G2Supply } from "@/lib/g2";
import { baselineRange, buildG3Report, monthRange, type G3Menu, type G3Reservation } from "@/lib/g3";
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

export const getG3Report = createServerFn({ method: "POST" })
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

    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG3Report({
          groupName: group.name,
          monthStart: data.monthStart,
          today: todayISO(),
          kitchens: [],
          menus: [],
          reservations: [],
          supplies: [],
          movements: [],
        }),
      };
    }

    // The month plus the three months before it, which set each kitchen's usual consumption.
    const month = monthRange(data.monthStart);
    const from = baselineRange(month.from).from;
    const [{ data: comedores, error: cErr }, { data: insumos, error: iErr }, menus] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds),
      supabaseAdmin
        .from("insumos")
        .select("id,comedor_id,nombre,unidad,stock_actual,precio_referencial")
        .in("comedor_id", kitchenIds),
      fetchAllRows<G3Menu>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id,comedor_id,fecha,nombre_plato,publicado,raciones_disponibles")
          .in("comedor_id", kitchenIds)
          .gte("fecha", from)
          .lte("fecha", month.to)
          .order("id")
          .range(f, t),
      ).catch(friendly),
    ]);
    if (cErr) throw new Error(friendlySupabaseError(cErr.message));
    if (iErr) throw new Error(friendlySupabaseError(iErr.message));

    const reservations: G3Reservation[] = [];
    for (const ids of chunks(menus.map((m) => m.id))) {
      const rows = await fetchAllRows<G3Reservation>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("menu_id,comedor_id,cantidad,estado")
          .in("menu_id", ids)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      reservations.push(...rows);
    }

    const supplies: G2Supply[] = (insumos ?? []).map((i: any) => ({
      id: i.id,
      comedor_id: i.comedor_id,
      nombre: i.nombre,
      unidad: i.unidad,
      stock_actual: Number(i.stock_actual) || 0,
      precio_referencial: i.precio_referencial == null ? null : Number(i.precio_referencial),
    }));

    const movements: G2Movement[] = [];
    for (const ids of chunks(supplies.map((s) => s.id))) {
      const rows = await fetchAllRows<any>((f, t) =>
        supabaseAdmin
          .from("movimientos_insumo")
          .select("insumo_id,tipo,cantidad,fecha,precio_unitario")
          .in("insumo_id", ids)
          .gte("fecha", from)
          .lte("fecha", month.to)
          .order("id")
          .range(f, t),
      ).catch(friendly);
      movements.push(
        ...rows.map((m) => ({
          insumo_id: m.insumo_id,
          tipo: m.tipo,
          cantidad: Number(m.cantidad) || 0,
          fecha: m.fecha,
          precio_unitario: m.precio_unitario == null ? null : Number(m.precio_unitario),
        })),
      );
    }

    const nombrePorId = new Map((comedores ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));
    return {
      emptyMessage: null,
      report: buildG3Report({
        groupName: group.name,
        monthStart: data.monthStart,
        today: todayISO(),
        kitchens: kitchenIds.map((id) => ({ id, nombre: nombrePorId.get(id) ?? "Olla" })),
        menus,
        reservations,
        supplies,
        movements,
      }),
    };
  });
