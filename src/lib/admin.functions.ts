import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailDeDni, claveDePin, esDni, validarPin } from "@/lib/dni-cuenta";

async function exigirAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

async function platformRoles(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  return {
    admin: roles.includes("admin"),
    supervisor: roles.includes("supervisor"),
  };
}

export const soyAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    return { admin: !!data };
  });

export const adminListarComedores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, supervisor } = await platformRoles(context);
    if (!admin && !supervisor) throw new Error("No tienes permiso para ver esta sección");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: comedores }, { data: personal }, { data: benef }, { data: reservas }, { data: assignments }] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre,tipo,distrito,direccion,activo,precio_menu,raciones_diarias,telefono_whatsapp,yape_numero,created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("usuarios_comedor").select("comedor_id"),
      supabaseAdmin.from("beneficiarios").select("comedor_id"),
      supabaseAdmin.from("reservas").select("comedor_id"),
      supervisor && !admin
        ? supabaseAdmin.from("supervisor_assignments").select("comedor_id").eq("user_id", context.userId)
        : Promise.resolve({ data: [] as { comedor_id: string }[] }),
    ]);
    const allowed = admin ? null : new Set((assignments ?? []).map((a) => a.comedor_id));
    const cuenta = (rows: any[] | null, id: string) => (rows ?? []).filter((r) => r.comedor_id === id).length;
    return (comedores ?? [])
      .filter((c) => !allowed || allowed.has(c.id))
      .map((c) => ({
        ...c,
        socias: cuenta(personal, c.id),
        beneficiarios: cuenta(benef, c.id),
        reservas: cuenta(reservas, c.id),
      }));
  });

export const adminActivarComedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string; activo: boolean }) => d)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("comedores").update({ activo: data.activo }).eq("id", data.comedor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCrearComedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nombre: string; distrito: string; direccion: string;
    presidenta: string; dni: string; pin: string; telefono?: string; con_cuenta?: boolean;
  }) => {
    if (!d.nombre.trim()) throw new Error("Pon el nombre del comedor");
    if (d.con_cuenta) {
      if (!esDni(d.dni)) throw new Error("El DNI debe tener 8 números");
      validarPin(d.pin);
      if (!d.presidenta.trim()) throw new Error("Pon el nombre de la presidenta");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: comedor, error: e1 } = await supabaseAdmin.from("comedores").insert({
      nombre: data.nombre.trim(),
      tipo: "comedor",
      distrito: data.distrito.trim() || "Por completar",
      direccion: data.direccion.trim() || "Por completar",
      lat: -12.0464, lng: -77.0428,
    }).select().single();
    if (e1 || !comedor) throw new Error(e1?.message ?? "No se pudo crear el comedor");

    if (!data.con_cuenta) return { ok: true, comedor_id: comedor.id, nombre: comedor.nombre };

    const { data: u, error: e2 } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeDni(data.dni), password: claveDePin(data.dni, data.pin), email_confirm: true,
    });
    if (e2 || !u.user) {
      await supabaseAdmin.from("comedores").delete().eq("id", comedor.id);
      throw new Error(e2?.message ?? "No se pudo crear la cuenta");
    }
    const { error: e3 } = await supabaseAdmin.from("usuarios_comedor").insert({
      user_id: u.user.id, comedor_id: comedor.id, nombre: data.presidenta.trim(), cargo: "presidenta",
      dni: data.dni.trim(), telefono: data.telefono?.trim() || null,
    });
    if (e3) throw new Error(e3.message);
    return { ok: true, comedor_id: comedor.id, nombre: comedor.nombre };
  });

export const adminActualizarComedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    comedor_id: string; nombre: string; tipo: string; distrito: string; direccion: string;
    precio_menu: number; raciones_diarias: number; telefono_whatsapp?: string; yape_numero?: string;
  }) => {
    if (!d.nombre.trim()) throw new Error("Pon el nombre");
    if (!["comedor", "olla", "restaurante"].includes(d.tipo)) throw new Error("Tipo inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("comedores").update({
      nombre: data.nombre.trim(),
      tipo: data.tipo as any,
      distrito: data.distrito.trim() || "Por completar",
      direccion: data.direccion.trim() || "Por completar",
      precio_menu: Number(data.precio_menu) || 0,
      raciones_diarias: Number(data.raciones_diarias) || 0,
      telefono_whatsapp: data.telefono_whatsapp?.trim() || null,
      yape_numero: data.yape_numero?.trim() || null,
    }).eq("id", data.comedor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Enlace abierto: quien lo reciba registra los datos de su olla y se crea sola.
export const adminCrearEnlaceRegistro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nombre?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { data: inv, error } = await supabaseAdmin.from("invitaciones").insert({
      comedor_id: null,
      cargo: "presidenta" as any,
      nombre: data.nombre?.trim() || null,
      token,
      creado_por: context.userId,
    }).select("id, token, expira_at").single();
    if (error) throw new Error(error.message);
    return inv;
  });

const CARGOS_ADMIN = [
  "presidenta", "vicepresidenta", "tesorera", "almacenera", "cocinera",
  "secretaria", "fiscal", "vocal", "socia",
] as const;

export const adminCrearInvitacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string; cargo: string; nombre?: string; email?: string }) => {
    if (!(CARGOS_ADMIN as readonly string[]).includes(d.cargo)) throw new Error("Cargo inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { data: inv, error } = await supabaseAdmin.from("invitaciones").insert({
      comedor_id: data.comedor_id,
      cargo: data.cargo as any,
      nombre: data.nombre?.trim() || null,
      email: data.email?.trim() || null,
      token,
      creado_por: context.userId,
    }).select("id, token, expira_at").single();
    if (error) throw new Error(error.message);
    return inv;
  });

export const adminEliminarComedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string }) => d)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("comedores").delete().eq("id", data.comedor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: vinculos }, { data: comedores }, { data: auth }] = await Promise.all([
      supabaseAdmin.from("usuarios_comedor").select("id,user_id,comedor_id,nombre,cargo,telefono,created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("comedores").select("id,nombre"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const mapC = new Map((comedores ?? []).map((c) => [c.id, c.nombre]));
    const mapU = new Map((auth?.users ?? []).map((u: any) => [u.id, u.email as string]));
    return (vinculos ?? []).map((v) => ({
      ...v,
      comedor_nombre: mapC.get(v.comedor_id) ?? "—",
      email: mapU.get(v.user_id) ?? "—",
    }));
  });

// Uso diario: una fila por olla/comedor, una columna por día.
export const adminActividadDiaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dias?: number } | undefined) => ({ dias: Math.min(Math.max(d?.dias ?? 14, 1), 31) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hoy = new Date();
    const dias: string[] = [];
    for (let i = data.dias - 1; i >= 0; i--) {
      const d = new Date(hoy);
      d.setUTCDate(d.getUTCDate() - i);
      dias.push(d.toISOString().slice(0, 10));
    }
    const desde = dias[0]!;
    const desdeISO = `${desde}T00:00:00Z`;

    const [{ data: comedores }, { data: menus }, { data: reservas }, { data: cajas }] = await Promise.all([
      supabaseAdmin.from("comedores").select("id,nombre,distrito,activo").order("nombre"),
      supabaseAdmin.from("menus").select("comedor_id,fecha,publicado").gte("fecha", desde),
      supabaseAdmin.from("reservas").select("comedor_id,created_at,cantidad").gte("created_at", desdeISO),
      supabaseAdmin.from("caja_dias").select("comedor_id,fecha,total_ingresos").gte("fecha", desde),
    ]);

    const clave = (c: string, f: string) => `${c}|${f}`;
    const acumulado = new Map<string, { menus: number; reservas: number; ingresos: number }>();
    const toca = (c: string, f: string) => {
      const k = clave(c, f);
      let v = acumulado.get(k);
      if (!v) { v = { menus: 0, reservas: 0, ingresos: 0 }; acumulado.set(k, v); }
      return v;
    };
    for (const m of menus ?? []) if (m.publicado) toca(m.comedor_id, m.fecha).menus += 1;
    for (const r of reservas ?? []) toca(r.comedor_id, String(r.created_at).slice(0, 10)).reservas += r.cantidad ?? 1;
    for (const c of cajas ?? []) toca(c.comedor_id, c.fecha).ingresos += Number(c.total_ingresos) || 0;

    return {
      dias,
      filas: (comedores ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        distrito: c.distrito,
        activo: c.activo,
        celdas: dias.map((f) => acumulado.get(clave(c.id, f)) ?? { menus: 0, reservas: 0, ingresos: 0 }),
      })),
    };
  });

export const adminCrearUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string; nombre: string; cargo: string; dni: string; pin: string; telefono?: string }) => {
    if (!d.comedor_id) throw new Error("Elige la olla o comedor");
    if (!d.nombre.trim()) throw new Error("Pon el nombre");
    if (!(CARGOS_ADMIN as readonly string[]).includes(d.cargo)) throw new Error("Cargo inválido");
    if (!esDni(d.dni)) throw new Error("El DNI debe tener 8 números");
    validarPin(d.pin);
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeDni(data.dni), password: claveDePin(data.dni, data.pin), email_confirm: true,
    });
    if (e1 || !u.user) throw new Error(e1?.message ?? "No se pudo crear la cuenta");
    const { error: e2 } = await supabaseAdmin.from("usuarios_comedor").insert({
      user_id: u.user.id, comedor_id: data.comedor_id, nombre: data.nombre.trim(),
      cargo: data.cargo as any, telefono: data.telefono?.trim() || null, dni: data.dni.trim(),
    });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(u.user.id);
      throw new Error(e2.message);
    }
    return { ok: true };
  });

export const adminCambiarCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; cargo: string }) => {
    if (!(CARGOS_ADMIN as readonly string[]).includes(d.cargo)) throw new Error("Cargo inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("usuarios_comedor").update({ cargo: data.cargo as any }).eq("id", data.vinculo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminEliminarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vinculo_id: string; borrar_cuenta?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v } = await supabaseAdmin.from("usuarios_comedor").select("user_id").eq("id", data.vinculo_id).maybeSingle();
    const { error } = await supabaseAdmin.from("usuarios_comedor").delete().eq("id", data.vinculo_id);
    if (error) throw new Error(error.message);
    if (data.borrar_cuenta && v?.user_id) await supabaseAdmin.auth.admin.deleteUser(v.user_id);
    return { ok: true };
  });