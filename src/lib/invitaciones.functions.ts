import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailDeDni, claveDePin, esDni, validarPin } from "@/lib/dni-cuenta";

const CARGOS = [
  "vicepresidenta", "tesorera", "almacenera", "cocinera",
  "secretaria", "fiscal", "vocal", "socia",
] as const;
type CargoIn = (typeof CARGOS)[number];

function nuevoToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

export const crearInvitacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string; cargo: CargoIn; nombre?: string; email?: string }) => {
    if (!CARGOS.includes(d.cargo)) throw new Error("Cargo inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    const token = nuevoToken();
    const { data: inv, error } = await context.supabase
      .from("invitaciones")
      .insert({
        comedor_id: data.comedor_id,
        cargo: data.cargo,
        nombre: data.nombre?.trim() || null,
        email: data.email?.trim() || null,
        token,
        creado_por: context.userId,
      })
      .select("id, token, expira_at")
      .single();
    if (error) throw new Error(error.message);
    return inv;
  });

export const listarInvitaciones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invitaciones")
      .select("id, token, cargo, nombre, email, expira_at, usado_at, created_at")
      .eq("comedor_id", data.comedor_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const eliminarInvitacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("invitaciones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Público: consultar una invitación por su enlace
export const verInvitacion = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => {
    if (!d.token || d.token.length < 20) throw new Error("Enlace inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invitaciones")
      .select("cargo, nombre, email, expira_at, usado_at, comedor_id, comedor:comedores(nombre)")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valida: false as const, motivo: "Este enlace no existe." };
    if (inv.usado_at) return { valida: false as const, motivo: "Este enlace ya fue usado." };
    if (new Date(inv.expira_at) < new Date()) return { valida: false as const, motivo: "Este enlace ya venció." };
    return {
      valida: true as const,
      tipo: (inv as any).comedor_id ? ("equipo" as const) : ("registro" as const),
      cargo: inv.cargo as string,
      nombre: inv.nombre as string | null,
      email: inv.email as string | null,
      comedor: (inv as any).comedor?.nombre as string,
    };
  });

// Público: aceptar la invitación creando la cuenta
export const aceptarInvitacion = createServerFn({ method: "POST" })
  .inputValidator((d: {
    token: string; nombre: string; pin: string; telefono: string; dni: string;
    olla?: { nombre: string; tipo: string; distrito: string; direccion: string; precio_menu: number; raciones_diarias: number; telefono_whatsapp?: string };
  }) => {
    if (!d.token || d.token.length < 20) throw new Error("Enlace inválido");
    if (!d.nombre.trim()) throw new Error("Pon tu nombre");
    validarPin(d.pin);
    if (!/^\d{9}$/.test(d.telefono)) throw new Error("El celular debe tener 9 dígitos");
    if (!esDni(d.dni)) throw new Error("El DNI debe tener 8 dígitos");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invitaciones")
      .select("id, comedor_id, cargo, usado_at, expira_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Este enlace no existe");
    if (inv.usado_at) throw new Error("Este enlace ya fue usado");
    if (new Date(inv.expira_at) < new Date()) throw new Error("Este enlace ya venció");

    let comedorId = inv.comedor_id;
    let cargo = inv.cargo;
    if (!comedorId) {
      const o = data.olla;
      if (!o || !o.nombre.trim()) throw new Error("Pon el nombre de la olla o comedor");
      const { data: nuevo, error: eC } = await supabaseAdmin.from("comedores").insert({
        nombre: o.nombre.trim(),
        tipo: (o.tipo || "comedor") as any,
        distrito: o.distrito.trim() || "Por completar",
        direccion: o.direccion.trim() || "Por completar",
        lat: -12.0464, lng: -77.0428,
        precio_menu: Number(o.precio_menu) || 0,
        raciones_diarias: Number(o.raciones_diarias) || 0,
        telefono_whatsapp: o.telefono_whatsapp?.trim() || null,
      }).select("id").single();
      if (eC || !nuevo) throw new Error(eC?.message ?? "No se pudo crear la olla o comedor");
      comedorId = nuevo.id;
      cargo = "presidenta";
    }

    const { data: u, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeDni(data.dni), password: claveDePin(data.dni, data.pin), email_confirm: true,
    });
    if (e1 || !u.user) throw new Error(e1?.message ?? "No se pudo crear la cuenta");

    const { error: e2 } = await supabaseAdmin.from("usuarios_comedor").insert({
      user_id: u.user.id,
      comedor_id: comedorId,
      nombre: data.nombre.trim(),
      cargo,
      telefono: data.telefono,
      dni: data.dni,
    });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(u.user.id).catch(() => {});
      throw new Error(e2.message);
    }
    await supabaseAdmin.from("invitaciones")
      .update({ usado_at: new Date().toISOString(), usado_por: u.user.id, comedor_id: comedorId })
      .eq("id", inv.id);
    return { ok: true };
  });