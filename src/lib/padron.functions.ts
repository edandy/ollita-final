import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { claveDePin, emailDeDni } from "@/lib/dni-cuenta";
import {
  friendlyCreateBeneficiaryError,
  resolveKitchenAccountAction,
  staffToPadronRow,
  SUPERVISOR_PADRON_NOTE,
  validateCreateBeneficiary,
  type CreateBeneficiaryInput,
  type KitchenAccountFacts,
} from "@/lib/padron";
import { requireKitchenWriter } from "@/lib/supervisor.functions";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function writeStaffToPadron(
  admin: AdminClient,
  input: { comedor_id: string; nombre: string; dni: string; telefono?: string | null },
) {
  const row = staffToPadronRow(input);
  const { data: existing } = await admin
    .from("beneficiarios")
    .select("id")
    .eq("comedor_id", row.comedor_id)
    .eq("dni", row.dni)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin.from("beneficiarios").insert(row);
  if (error) throw new Error(friendlyCreateBeneficiaryError(error.message));
}

async function findAuthUserId(admin: AdminClient, dni: string) {
  const email = emailDeDni(dni);
  const { data, error } = await admin.rpc("auth_user_id_by_email", { _email: email });
  if (error) return null;
  return (data as string | null) ?? null;
}

async function gatherKitchenAccountFacts(
  admin: AdminClient,
  dni: string,
  comedorId: string,
): Promise<{ facts: KitchenAccountFacts; userId: string | null }> {
  const { data: members } = await admin
    .from("usuarios_comedor")
    .select("user_id, comedor_id")
    .eq("dni", dni);

  const inThis = (members ?? []).find((m) => m.comedor_id === comedorId);
  const inOther = (members ?? []).find((m) => m.comedor_id !== comedorId);

  const { data: supervisor } = await admin
    .from("supervisors")
    .select("user_id")
    .eq("dni", dni)
    .maybeSingle();

  let userId = inThis?.user_id ?? inOther?.user_id ?? supervisor?.user_id ?? null;
  if (!userId) userId = await findAuthUserId(admin, dni);

  let isSupervisor = !!supervisor;
  if (userId && !isSupervisor) {
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "supervisor")
      .maybeSingle();
    isSupervisor = !!role;
  }

  return {
    facts: {
      memberInThisKitchen: !!inThis,
      memberInOtherKitchen: !!inOther,
      hasAuthUser: !!userId,
      isSupervisor,
    },
    userId,
  };
}

async function insertKitchenMembership(
  admin: AdminClient,
  input: { userId: string; comedorId: string; nombre: string; dni: string; phone: string | null },
) {
  const { error } = await admin.from("usuarios_comedor").insert({
    user_id: input.userId,
    comedor_id: input.comedorId,
    nombre: input.nombre,
    cargo: "socia",
    dni: input.dni,
    telefono: input.phone,
  });
  if (error) throw new Error(friendlyCreateBeneficiaryError(error.message));
}

async function ensureKitchenAccount(admin: AdminClient, data: CreateBeneficiaryInput) {
  const { facts, userId } = await gatherKitchenAccountFacts(admin, data.dni, data.comedor_id);
  const action = resolveKitchenAccountAction(facts);

  if (action === "skip") return { account: "skipped" as const };
  if (action === "reject_supervisor") return { account: "skipped_supervisor" as const };

  if (action === "link") {
    if (!userId) throw new Error("Este DNI ya tiene una cuenta");
    await insertKitchenMembership(admin, {
      userId,
      comedorId: data.comedor_id,
      nombre: data.nombre,
      dni: data.dni,
      phone: data.phone,
    });
    return { account: "linked" as const };
  }

  const created = await admin.auth.admin.createUser({
    email: emailDeDni(data.dni),
    password: claveDePin(data.dni, data.pin),
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    const existingId = await findAuthUserId(admin, data.dni);
    const already = /already/i.test(created.error?.message ?? "");
    if (existingId && already) {
      await insertKitchenMembership(admin, {
        userId: existingId,
        comedorId: data.comedor_id,
        nombre: data.nombre,
        dni: data.dni,
        phone: data.phone,
      });
      return { account: "linked" as const };
    }
    throw new Error(friendlyCreateBeneficiaryError(created.error?.message ?? "No se pudo crear el usuario"));
  }

  try {
    await insertKitchenMembership(admin, {
      userId: created.data.user.id,
      comedorId: data.comedor_id,
      nombre: data.nombre,
      dni: data.dni,
      phone: data.phone,
    });
  } catch (err) {
    await admin.auth.admin.deleteUser(created.data.user.id).catch(() => {});
    throw err;
  }

  return { account: "created" as const };
}

function beneficiaryRow(data: CreateBeneficiaryInput, extra?: { direccion?: string | null; activo?: boolean }) {
  return {
    comedor_id: data.comedor_id,
    nombre_completo: data.nombre,
    dni: data.dni,
    telefono: data.phone,
    carga_familiar: data.cargaFamiliar,
    categoria: data.categoria,
    subtipo_caso_social: data.socialSubtype,
    vigencia_hasta: data.validUntil,
    direccion: extra?.direccion ?? null,
    activo: extra?.activo ?? true,
  };
}

export const crearBeneficiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nombre: string;
    dni: string;
    pin: string;
    telefono?: string;
    categoria: string;
    carga?: string | number;
    subtipo?: string;
    vigencia?: string;
    comedor_id: string;
  }) => validateCreateBeneficiary(d))
  .handler(async ({ data, context }) => {
    await requireKitchenWriter(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("beneficiarios")
      .select("id")
      .eq("comedor_id", data.comedor_id)
      .eq("dni", data.dni)
      .maybeSingle();
    if (existing) throw new Error("Esta persona ya está en el padrón");

    const { error } = await supabaseAdmin.from("beneficiarios").insert(beneficiaryRow(data));
    if (error) throw new Error(friendlyCreateBeneficiaryError(error.message));

    const result = await ensureKitchenAccount(supabaseAdmin, data);
    return {
      ok: true,
      note: result.account === "skipped_supervisor" ? SUPERVISOR_PADRON_NOTE : null,
    };
  });

export const importarPadron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    comedor_id: string;
    rows: Array<{
      nombre: string;
      dni: string;
      pin: string;
      telefono?: string;
      direccion?: string | null;
      carga?: string | number;
      activo?: boolean;
    }>;
  }) => {
    if (!d.comedor_id) throw new Error("Falta la olla");
    if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error("No hay personas para importar");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireKitchenWriter(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let imported = 0;
    let accountsCreated = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [index, row] of data.rows.entries()) {
      const line = index + 1;
      let parsed: CreateBeneficiaryInput;
      try {
        parsed = validateCreateBeneficiary({
          nombre: row.nombre,
          dni: row.dni,
          pin: row.pin,
          telefono: row.telefono,
          categoria: "socia_familia",
          carga: row.carga,
          comedor_id: data.comedor_id,
        });
      } catch (err: any) {
        errors.push(`Fila ${line}: ${err?.message ?? "datos inválidos"}`);
        continue;
      }

      const { error } = await supabaseAdmin.from("beneficiarios").upsert(
        beneficiaryRow(parsed, { direccion: row.direccion ?? null, activo: row.activo ?? true }),
        { onConflict: "comedor_id,dni" },
      );
      if (error) {
        errors.push(`Fila ${line}: ${friendlyCreateBeneficiaryError(error.message)}`);
        continue;
      }
      imported += 1;

      try {
        const result = await ensureKitchenAccount(supabaseAdmin, parsed);
        if (result.account === "created" || result.account === "linked") accountsCreated += 1;
        if (result.account === "skipped_supervisor") {
          warnings.push(`DNI ${parsed.dni}: ${SUPERVISOR_PADRON_NOTE}`);
        }
      } catch (err: any) {
        errors.push(`Fila ${line}: ${friendlyCreateBeneficiaryError(err?.message ?? "")}`);
      }
    }

    return { imported, accountsCreated, errors, warnings };
  });

export const sincronizarEquipoEnPadron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { comedor_id: string }) => {
    if (!d.comedor_id) throw new Error("Falta la olla");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireKitchenWriter(context, data.comedor_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("usuarios_comedor")
      .select("nombre, dni, telefono, cargo")
      .eq("comedor_id", data.comedor_id)
      .neq("cargo", "socia");
    if (error) throw new Error(friendlyCreateBeneficiaryError(error.message));

    let synced = 0;
    for (const member of members ?? []) {
      if (!member.dni) continue;
      try {
        await writeStaffToPadron(supabaseAdmin, {
          comedor_id: data.comedor_id,
          nombre: member.nombre,
          dni: member.dni,
          telefono: member.telefono,
        });
        synced += 1;
      } catch {
        /* skip members without a valid DNI */
      }
    }
    return { synced };
  });
