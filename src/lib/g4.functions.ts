import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kitchensForG1 } from "@/lib/g1";
import { assignedKitchenIds, exigirAdminOSupervisor, loadGroups } from "@/lib/g1.functions";
import { buildG4Report, g4Period, type G4Beneficiary, type G4Mode, type G4Pickup } from "@/lib/g4";
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

/** Returns counts only: names and DNIs of the padrón never leave the server. */
export const getG4Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { groupId: string; mode: G4Mode; start: string }) => {
    if (!d.groupId) throw new Error("Elige un grupo");
    if (d.mode !== "month" && d.mode !== "year") throw new Error("Elige un mes o un año");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start ?? "")) throw new Error("Elige un período");
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
    const base = { groupName: group.name, mode: data.mode, start: data.start, today };

    if (kitchenIds.length === 0) {
      return {
        emptyMessage: admin ? "Este grupo aún no tiene ollas." : "Este grupo no tiene ollas que puedas ver.",
        report: buildG4Report({ ...base, kitchens: [], beneficiaries: [], pickups: [] }),
      };
    }

    const period = g4Period(data.mode, data.start, today);
    const [{ data: comedores, error: cErr }, beneficiaries, menus] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre").in("id", kitchenIds),
      fetchAllRows<G4Beneficiary>((f, t) =>
        supabaseAdmin
          .from("beneficiarios")
          .select(
            "id,comedor_id,dni,activo,care_group,birth_date,carga_familiar,telefono,direccion,foto_url,created_at",
          )
          .in("comedor_id", kitchenIds)
          .order("id")
          .range(f, t),
      ).catch(friendly),
      fetchAllRows<{ id: string }>((f, t) =>
        supabaseAdmin
          .from("menus")
          .select("id")
          .in("comedor_id", kitchenIds)
          .gte("fecha", period.from)
          .lte("fecha", period.until ?? period.to)
          .order("id")
          .range(f, t),
      ).catch(friendly),
    ]);
    if (cErr) throw new Error(friendlySupabaseError(cErr.message));

    const pickups: G4Pickup[] = [];
    for (const ids of chunks(menus.map((m) => m.id))) {
      const rows = await fetchAllRows<G4Pickup>((f, t) =>
        supabaseAdmin
          .from("reservas")
          .select("comedor_id,dni,beneficiario_id")
          .in("menu_id", ids)
          .eq("estado", "recogida")
          .order("id")
          .range(f, t),
      ).catch(friendly);
      pickups.push(...rows);
    }

    const nombrePorId = new Map((comedores ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));
    return {
      emptyMessage: null,
      report: buildG4Report({
        ...base,
        kitchens: kitchenIds.map((id) => ({ id, nombre: nombrePorId.get(id) ?? "Olla" })),
        beneficiaries,
        pickups,
      }),
    };
  });
