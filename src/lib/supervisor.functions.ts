import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { esSoloLectura, type Cargo } from "@/lib/permisos";
import { validateCreatePlatformUser, validateUpdatePlatformUser, friendlyCreatePlatformUserError } from "@/lib/supervisor";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el administrador de la plataforma puede hacer esto");
}

export async function requireKitchenManager(context: { supabase: any; userId: string }, comedorId: string) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if ((roles ?? []).some((r: { role: string }) => r.role === "admin")) return;

  const { data: member } = await context.supabase
    .from("usuarios_comedor")
    .select("cargo")
    .eq("user_id", context.userId)
    .eq("comedor_id", comedorId)
    .maybeSingle();
  if (member?.cargo === "presidenta") return;

  const { data: supervisor } = await context.supabase
    .from("supervisors")
    .select("access_level")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (supervisor?.access_level === "full") {
    const { data: assignment } = await context.supabase
      .from("supervisor_assignments")
      .select("comedor_id")
      .eq("user_id", context.userId)
      .eq("comedor_id", comedorId)
      .maybeSingle();
    if (assignment) return;
  }

  throw new Error("Solo la presidenta o un supervisor con acceso completo puede hacer esto");
}

export async function requireKitchenWriter(context: { supabase: any; userId: string }, comedorId: string) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if ((roles ?? []).some((r: { role: string }) => r.role === "admin")) return;

  const { data: member } = await context.supabase
    .from("usuarios_comedor")
    .select("cargo")
    .eq("user_id", context.userId)
    .eq("comedor_id", comedorId)
    .maybeSingle();
  if (member?.cargo && !esSoloLectura(member.cargo as Cargo)) return;

  const { data: supervisor } = await context.supabase
    .from("supervisors")
    .select("access_level")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (supervisor?.access_level === "full") {
    const { data: assignment } = await context.supabase
      .from("supervisor_assignments")
      .select("comedor_id")
      .eq("user_id", context.userId)
      .eq("comedor_id", comedorId)
      .maybeSingle();
    if (assignment) return;
  }

  throw new Error("No tienes permiso para registrar personas en esta olla");
}

export const getPlatformAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const admin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    const supervisor = (roles ?? []).some((r: { role: string }) => r.role === "supervisor");
    let accessLevel: "view" | "full" | null = null;
    let name: string | null = null;
    if (supervisor) {
      const { data: profile } = await context.supabase
        .from("supervisors")
        .select("access_level, name")
        .eq("user_id", context.userId)
        .maybeSingle();
      accessLevel = profile?.access_level ?? null;
      name = profile?.name ?? null;
    }
    return { admin, supervisor, accessLevel, name };
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roles }, { data: profiles }, { data: assignments }, { data: kitchens }, { data: auth }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id,role").in("role", ["admin", "supervisor"]),
      supabaseAdmin.from("supervisors").select("user_id,name,access_level,dni,phone,created_at"),
      supabaseAdmin.from("supervisor_assignments").select("user_id,comedor_id"),
      supabaseAdmin.from("comedores").select("id,nombre"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const kitchenNames = new Map((kitchens ?? []).map((k) => [k.id, k.nombre]));
    const authUsers = new Map((auth?.users ?? []).map((u) => [u.id, u]));
    const profilesByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const userIds = [...new Set((roles ?? []).map((r) => r.user_id))];
    return userIds.map((userId) => {
      const userRoles = (roles ?? []).filter((r) => r.user_id === userId).map((r) => r.role);
      const role = userRoles.includes("admin") ? "admin" as const : "supervisor" as const;
      const profile = profilesByUser.get(userId);
      const authUser = authUsers.get(userId);
      const meta = (authUser?.user_metadata ?? {}) as { name?: string; dni?: string; phone?: string };
      const kitchenIds = role === "supervisor"
        ? (assignments ?? []).filter((a) => a.user_id === userId).map((a) => a.comedor_id)
        : [];
      return {
        userId,
        role,
        name: profile?.name || meta.name || "—",
        accessLevel: role === "supervisor" ? (profile?.access_level ?? "view") : null,
        createdAt: profile?.created_at ?? authUser?.created_at ?? null,
        dni: profile?.dni || meta.dni || null,
        phone: profile?.phone || meta.phone || null,
        email: authUser?.email ?? "—",
        comedorIds: kitchenIds,
        kitchenNames: kitchenIds.map((id) => kitchenNames.get(id) ?? "—"),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  });

export const createPlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    role: string;
    name: string;
    dni: string;
    pin: string;
    phone?: string;
    accessLevel?: string;
    comedorIds?: string[];
  }) => validateCreatePlatformUser(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members } = await supabaseAdmin.from("usuarios_comedor").select("user_id");
    const { data: auth } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = (auth?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === data.email);
    if (existing && (members ?? []).some((m) => m.user_id === existing.id)) {
      throw new Error("Esa cuenta ya es integrante de una olla");
    }
    if (existing) {
      const { data: existingRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", existing.id);
      if ((existingRoles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "supervisor")) {
        throw new Error("Esa persona ya tiene una cuenta de plataforma");
      }
    }

    let userId = existing?.id;
    if (!userId) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name, dni: data.dni, phone: data.phone },
      });
      if (created.error || !created.data.user) throw new Error(friendlyCreatePlatformUserError(created.error?.message ?? "No se pudo crear la cuenta"));
      userId = created.data.user.id;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { name: data.name, dni: data.dni, phone: data.phone },
      });
    }

    const rollback = async () => {
      if (!existing && userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    };

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    if (roleError) {
      await rollback();
      throw new Error(friendlyCreatePlatformUserError(roleError.message));
    }

    if (data.role === "supervisor") {
      if (!data.accessLevel) throw new Error("Nivel de acceso inválido");
      const { error: profileError } = await supabaseAdmin.from("supervisors").insert({
        user_id: userId,
        name: data.name,
        access_level: data.accessLevel,
        dni: data.dni,
        phone: data.phone,
      });
      if (profileError) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "supervisor");
        await rollback();
        throw new Error(friendlyCreatePlatformUserError(profileError.message));
      }
      const { error: assignError } = await supabaseAdmin.from("supervisor_assignments").insert(
        data.comedorIds.map((comedor_id) => ({ user_id: userId, comedor_id })),
      );
      if (assignError) {
        await supabaseAdmin.from("supervisors").delete().eq("user_id", userId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "supervisor");
        await rollback();
        throw new Error(friendlyCreatePlatformUserError(assignError.message));
      }
    }
    return { ok: true };
  });

async function clearSupervisorRecords(supabaseAdmin: any, userId: string) {
  await supabaseAdmin.from("supervisor_assignments").delete().eq("user_id", userId);
  await supabaseAdmin.from("supervisors").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "supervisor");
}

export const updatePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    name: string;
    role: string;
    accessLevel?: string;
    comedorIds?: string[];
  }) => validateUpdatePlatformUser(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: currentRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    const wasAdmin = (currentRoles ?? []).some((r: { role: string }) => r.role === "admin");
    if (wasAdmin && data.role !== "admin") {
      const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
      if ((admins ?? []).length <= 1) throw new Error("Debe quedar al menos un administrador");
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const previousMeta = (authUser.user?.user_metadata ?? {}) as Record<string, unknown>;
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: { ...previousMeta, name: data.name },
    });

    if (data.role === "admin") {
      await clearSupervisorRecords(supabaseAdmin, data.userId);
      if (!wasAdmin) {
        const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: "admin" });
        if (error) throw new Error(friendlyCreatePlatformUserError(error.message));
      }
      return { ok: true };
    }

    if (wasAdmin) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    }
    if (!data.accessLevel) throw new Error("Nivel de acceso inválido");
    const { data: hasSupervisorRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "supervisor")
      .maybeSingle();
    if (!hasSupervisorRole) {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: "supervisor" });
      if (roleError) throw new Error(friendlyCreatePlatformUserError(roleError.message));
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("supervisors")
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existingProfile) {
      const { error: profileError } = await supabaseAdmin
        .from("supervisors")
        .update({ name: data.name, access_level: data.accessLevel })
        .eq("user_id", data.userId);
      if (profileError) throw new Error(friendlyCreatePlatformUserError(profileError.message));
    } else {
      const { error: profileError } = await supabaseAdmin.from("supervisors").insert({
        user_id: data.userId,
        name: data.name,
        access_level: data.accessLevel,
      });
      if (profileError) throw new Error(friendlyCreatePlatformUserError(profileError.message));
    }
    const { error: deleteError } = await supabaseAdmin.from("supervisor_assignments").delete().eq("user_id", data.userId);
    if (deleteError) throw new Error(friendlyCreatePlatformUserError(deleteError.message));
    const { error: assignError } = await supabaseAdmin.from("supervisor_assignments").insert(
      data.comedorIds.map((comedor_id) => ({ user_id: data.userId, comedor_id })),
    );
    if (assignError) throw new Error(friendlyCreatePlatformUserError(assignError.message));
    return { ok: true };
  });

export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; deleteAccount?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.userId === context.userId) throw new Error("No puedes eliminar tu propia cuenta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const onlyThisAdmin = (admins ?? []).length === 1 && admins![0]!.user_id === data.userId;
    if (onlyThisAdmin) throw new Error("Debe quedar al menos un administrador");
    await clearSupervisorRecords(supabaseAdmin, data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    if (data.deleteAccount) await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });
