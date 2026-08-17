import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailDeDni, claveDePin } from "@/lib/dni-cuenta";
import { requireKitchenManager } from "@/lib/supervisor.functions";
import {
  friendlyAssignStaffError,
  friendlyCreateStaffError,
  validateAssignStaffFromPadron,
  validateCreateStaff,
  type AssignableStaffCargo,
  type StaffCargo,
} from "@/lib/personal";

type CargoIn = StaffCargo;

// Solo la presidenta del comedor puede crear nuevas cuentas de personal.
export const crearPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dni: string; pin: string; nombre: string; cargo: CargoIn; comedor_id: string; telefono?: string }) => {
    return validateCreateStaff(d);
  })
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeDni(data.dni),
      password: claveDePin(data.dni, data.pin),
      email_confirm: true,
    });
    if (e1 || !u.user) throw new Error(friendlyCreateStaffError(e1?.message ?? "No se pudo crear el usuario"));

    const { error: e2 } = await supabaseAdmin.from("usuarios_comedor").insert({
      user_id: u.user.id,
      comedor_id: data.comedor_id,
      nombre: data.nombre,
      cargo: data.cargo,
      dni: data.dni,
      telefono: data.phone,
    });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(u.user.id).catch(() => {});
      throw new Error(friendlyCreateStaffError(e2.message));
    }
    const { writeStaffToPadron } = await import("@/lib/padron.functions");
    await writeStaffToPadron(supabaseAdmin, {
      comedor_id: data.comedor_id,
      nombre: data.nombre,
      dni: data.dni,
      telefono: data.phone,
    });
    return { ok: true };
  });

export const asignarPersonalDesdePadron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { beneficiary_id: string; cargo: AssignableStaffCargo; comedor_id: string }) => {
    return validateAssignStaffFromPadron(d);
  })
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: benef } = await supabaseAdmin
      .from("beneficiarios")
      .select("id, dni, nombre_completo, activo")
      .eq("id", data.beneficiaryId)
      .eq("comedor_id", data.comedor_id)
      .maybeSingle();
    if (!benef) throw new Error("Esta persona no está en el padrón");
    if (!benef.activo) throw new Error("Esta persona no está activa en el padrón");

    const { data: vinculo } = await supabaseAdmin
      .from("usuarios_comedor")
      .select("id, cargo")
      .eq("comedor_id", data.comedor_id)
      .eq("dni", benef.dni)
      .maybeSingle();
    if (!vinculo) {
      throw new Error("Esta persona no tiene cuenta. Regístrala de nuevo en el padrón con un PIN.");
    }
    if (vinculo.cargo === "presidenta") {
      throw new Error("No se puede cambiar el cargo de la presidenta");
    }

    const { error } = await supabaseAdmin
      .from("usuarios_comedor")
      .update({ cargo: data.cargo, nombre: benef.nombre_completo })
      .eq("id", vinculo.id)
      .eq("comedor_id", data.comedor_id);
    if (error) throw new Error(friendlyAssignStaffError(error.message));
    return { ok: true };
  });

export const eliminarPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; comedor_id: string }) => d)
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v } = await supabaseAdmin
      .from("usuarios_comedor")
      .select("user_id, cargo")
      .eq("id", data.vinculo_id)
      .eq("comedor_id", data.comedor_id)
      .maybeSingle();
    if (!v) throw new Error("No encontramos a esta persona en el equipo");
    if (v.user_id === context.userId) throw new Error("No puedes quitarte a ti misma");
    if (v.cargo === "presidenta") throw new Error("No se puede quitar a la presidenta");
    const { error } = await supabaseAdmin
      .from("usuarios_comedor")
      .update({ cargo: "socia" })
      .eq("id", data.vinculo_id)
      .eq("comedor_id", data.comedor_id);
    if (error) throw new Error(friendlyAssignStaffError(error.message));
    return { ok: true };
  });

export const actualizarCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; comedor_id: string; cargo: CargoIn }) => d)
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);
    if (data.cargo === "socia") throw new Error("Elige un cargo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v } = await supabaseAdmin
      .from("usuarios_comedor")
      .select("cargo")
      .eq("id", data.vinculo_id)
      .eq("comedor_id", data.comedor_id)
      .maybeSingle();
    if (v?.cargo === "presidenta") throw new Error("No se puede cambiar el cargo de la presidenta");
    const { error } = await supabaseAdmin.from("usuarios_comedor").update({ cargo: data.cargo }).eq("id", data.vinculo_id).eq("comedor_id", data.comedor_id);
    if (error) throw new Error(friendlyAssignStaffError(error.message));
    return { ok: true };
  });