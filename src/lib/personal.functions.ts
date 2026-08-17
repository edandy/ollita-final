import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailDeDni, claveDePin, esDni, validarPin } from "@/lib/dni-cuenta";
import { requireKitchenManager } from "@/lib/supervisor.functions";

type CargoIn =
  | "vicepresidenta"
  | "tesorera"
  | "almacenera"
  | "cocinera"
  | "secretaria"
  | "fiscal"
  | "vocal"
  | "socia";

const CARGOS_VALIDOS: CargoIn[] = [
  "vicepresidenta", "tesorera", "almacenera", "cocinera",
  "secretaria", "fiscal", "vocal", "socia",
];

// Solo la presidenta del comedor puede crear nuevas cuentas de personal.
export const crearPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dni: string; pin: string; nombre: string; cargo: CargoIn; comedor_id: string; telefono?: string }) => {
    if (!esDni(d.dni)) throw new Error("El DNI debe tener 8 números");
    validarPin(d.pin);
    if (!d.nombre.trim()) throw new Error("Nombre requerido");
    if (!CARGOS_VALIDOS.includes(d.cargo)) throw new Error("Cargo inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Crear usuario auth (auto-confirmado)
    const { data: u, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeDni(data.dni),
      password: claveDePin(data.dni, data.pin),
      email_confirm: true,
    });
    if (e1 || !u.user) throw new Error(e1?.message ?? "No se pudo crear el usuario");

    const { error: e2 } = await supabaseAdmin.from("usuarios_comedor").insert({
      user_id: u.user.id,
      comedor_id: data.comedor_id,
      nombre: data.nombre.trim(),
      cargo: data.cargo,
      dni: data.dni.trim(),
      telefono: data.telefono?.trim() || null,
    });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(u.user.id).catch(() => {});
      throw new Error(e2.message);
    }
    return { ok: true };
  });

export const eliminarPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; comedor_id: string }) => d)
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // No permitir que se elimine a sí misma
    const { data: v } = await supabaseAdmin.from("usuarios_comedor").select("user_id").eq("id", data.vinculo_id).maybeSingle();
    if (v?.user_id === context.userId) throw new Error("No puedes eliminarte a ti misma");
    const { error } = await supabaseAdmin.from("usuarios_comedor").delete().eq("id", data.vinculo_id).eq("comedor_id", data.comedor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const actualizarCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; comedor_id: string; cargo: CargoIn }) => d)
  .handler(async ({ data, context }) => {
    await requireKitchenManager(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("usuarios_comedor").update({ cargo: data.cargo }).eq("id", data.vinculo_id).eq("comedor_id", data.comedor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });