import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildG1Report,
  groupsForG1,
  kitchensForG1,
  weekRangeMonSat,
  type G1Reservation,
} from "@/lib/g1";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { fetchAllRows } from "@/lib/supabase-paging";
import type { GroupRow } from "@/lib/groups.functions";

async function platformRoles(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(friendlySupabaseError(error.message));
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  return {
    admin: roles.includes("admin"),
    supervisor: roles.includes("supervisor"),
  };
}

export async function exigirAdminOSupervisor(context: any) {
  const roles = await platformRoles(context);
  if (!roles.admin && !roles.supervisor) {
    throw new Error("No tienes permiso para ver esta sección");
  }
  return roles;
}

export async function assignedKitchenIds(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("supervisor_assignments")
    .select("comedor_id")
    .eq("user_id", userId);
  if (error) throw new Error(friendlySupabaseError(error.message));
  return (data ?? []).map((r: { comedor_id: string }) => r.comedor_id);
}

export async function loadGroups(supabaseAdmin: any): Promise<GroupRow[]> {
  const [{ data: groups, error: gErr }, { data: links, error: lErr }] = await Promise.all([
    supabaseAdmin.from("groups").select("id,name,created_at").order("name"),
    supabaseAdmin.from("group_kitchens").select("group_id,comedor_id"),
  ]);
  if (gErr) throw new Error(friendlySupabaseError(gErr.message));
  if (lErr) throw new Error(friendlySupabaseError(lErr.message));
  return (groups ?? []).map((g: { id: string; name: string; created_at: string }) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    kitchenIds: (links ?? [])
      .filter((l: { group_id: string }) => l.group_id === g.id)
      .map((l: { comedor_id: string }) => l.comedor_id),
  }));
}

export const listReportGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin } = await exigirAdminOSupervisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groups = await loadGroups(supabaseAdmin);
    const assigned = admin ? [] : await assignedKitchenIds(supabaseAdmin, context.userId);
    return groupsForG1(groups, { isAdmin: admin, assignedKitchenIds: assigned });
  });

export const getG1Report = createServerFn({ method: "POST" })
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

    const emptyMessage = kitchenIds.length === 0
      ? (admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.")
      : null;

    if (kitchenIds.length === 0) {
      return {
        emptyMessage,
        report: buildG1Report({
          groupName: group.name,
          weekStart: data.weekStart,
          kitchens: [],
          menus: [],
          reservations: [],
        }),
      };
    }

    const week = weekRangeMonSat(data.weekStart);
    const [{ data: comedores, error: cErr }, { data: menus, error: mErr }] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds),
      supabaseAdmin
        .from("menus")
        .select("id,comedor_id,fecha,publicado,raciones_disponibles")
        .in("comedor_id", kitchenIds)
        .gte("fecha", week.from)
        .lte("fecha", week.to),
    ]);
    if (cErr) throw new Error(friendlySupabaseError(cErr.message));
    if (mErr) throw new Error(friendlySupabaseError(mErr.message));

    const menuIds = (menus ?? []).map((m: { id: string }) => m.id);
    let reservations: G1Reservation[] = [];
    if (menuIds.length > 0) {
      const rows = await fetchAllRows<any>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("menu_id,comedor_id,cantidad,estado,codigo,dni,beneficiario_id,beneficiarios(categoria,subtipo_caso_social)")
          .in("menu_id", menuIds)
          .order("id")
          .range(f, t),
      ).catch((e: Error) => {
        throw new Error(friendlySupabaseError(e.message));
      });
      reservations = rows.map((r: any) => {
        const ben = Array.isArray(r.beneficiarios) ? r.beneficiarios[0] : r.beneficiarios;
        return {
          menu_id: r.menu_id,
          comedor_id: r.comedor_id,
          cantidad: r.cantidad,
          estado: r.estado,
          codigo: r.codigo,
          dni: r.dni,
          beneficiario_id: r.beneficiario_id,
          categoria: ben?.categoria ?? null,
          subtipo: ben?.subtipo_caso_social ?? null,
        };
      });
    }

    const nombrePorId = new Map((comedores ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));
    const kitchens = kitchenIds.map((id) => ({
      id,
      nombre: nombrePorId.get(id) ?? "Olla",
    }));

    return {
      emptyMessage,
      report: buildG1Report({
        groupName: group.name,
        weekStart: data.weekStart,
        kitchens,
        menus: menus ?? [],
        reservations,
      }),
    };
  });
