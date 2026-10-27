import { esDni, validarPin } from "./dni-cuenta";
import { CARGO_LABEL, type Cargo } from "./permisos";
import { todayISO } from "./dates";

export const BENEFICIARY_CATEGORIES = ["socia_familia", "publico_recurrente", "caso_social"] as const;
export type BeneficiaryCategory = (typeof BENEFICIARY_CATEGORIES)[number];

export const SOCIAL_SUBTYPES = ["adulto_mayor", "madre_soltera", "otro"] as const;
export type SocialSubtype = (typeof SOCIAL_SUBTYPES)[number];

/** Who the person is for care purposes, separate from how they relate to the kitchen (`categoria`). */
export const CARE_GROUPS = ["older_adult", "child", "social_case", "disability", "pregnant", "lactating"] as const;
export type CareGroup = (typeof CARE_GROUPS)[number];

export const CARE_GROUP_LABEL: Record<CareGroup, string> = {
  older_adult: "Adulto mayor",
  child: "Niña o niño",
  social_case: "Caso social",
  disability: "Persona con discapacidad",
  pregnant: "Gestante",
  lactating: "Lactante",
};

/** Groups whose report rows split by age, so they need a birth date. */
const CARE_GROUPS_BY_AGE: readonly CareGroup[] = ["older_adult", "child"];

export type CreateBeneficiaryInput = {
  nombre: string;
  dni: string;
  pin: string;
  phone: string | null;
  categoria: BeneficiaryCategory;
  cargaFamiliar: number;
  socialSubtype: SocialSubtype | null;
  validUntil: string | null;
  photoUrl: string | null;
  careGroup: CareGroup | null;
  birthDate: string | null;
  comedor_id: string;
};

export type UpdateBeneficiaryInput = Omit<CreateBeneficiaryInput, "pin"> & { id: string };

export type KitchenAccountFacts = {
  memberInThisKitchen: boolean;
  memberInOtherKitchen: boolean;
  hasAuthUser: boolean;
  isSupervisor: boolean;
};

export type KitchenAccountAction = "create" | "link" | "skip" | "reject_supervisor";

function isCategory(value: string): value is BeneficiaryCategory {
  return (BENEFICIARY_CATEGORIES as readonly string[]).includes(value);
}

function isSocialSubtype(value: string): value is SocialSubtype {
  return (SOCIAL_SUBTYPES as readonly string[]).includes(value);
}

function isCareGroup(value: string): value is CareGroup {
  return (CARE_GROUPS as readonly string[]).includes(value);
}

export function ageOn(birthDate: string, isoDate: string) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = isoDate.split("-").map(Number);
  const age = y! - by! - (m! < bm! || (m === bm && d! < bd!) ? 1 : 0);
  return Math.max(0, age);
}

function parseCare(careGroupRaw: string | undefined, birthDateRaw: string | undefined) {
  const raw = (careGroupRaw ?? "").trim();
  if (raw && !isCareGroup(raw)) throw new Error("Elige un grupo de atención");
  const careGroup = raw ? (raw as CareGroup) : null;

  const birthDate = (birthDateRaw ?? "").trim() || null;
  if (birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
      throw new Error("Revisa la fecha de nacimiento");
    }
    if (birthDate > todayISO()) throw new Error("La fecha de nacimiento no puede ser futura");
  } else if (careGroup && CARE_GROUPS_BY_AGE.includes(careGroup)) {
    throw new Error("Indica la fecha de nacimiento");
  }
  return { careGroup, birthDate };
}

function parseCarga(value: string | number | undefined) {
  const n = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parsePhotoUrl(value: string | null | undefined) {
  const url = value?.trim() || null;
  return url;
}

function parseSharedFields(input: {
  nombre: string;
  dni: string;
  telefono?: string;
  categoria: string;
  carga?: string | number;
  subtipo?: string;
  vigencia?: string;
  photoUrl?: string | null;
  careGroup?: string;
  birthDate?: string;
  comedor_id: string;
}) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Pon el nombre completo");

  const dni = input.dni.trim();
  if (!esDni(dni)) throw new Error("El DNI debe tener 8 dígitos");

  const phone = input.telefono?.trim() || null;
  if (phone && !/^\d{9}$/.test(phone)) throw new Error("El celular debe tener 9 dígitos");

  if (!isCategory(input.categoria)) throw new Error("Elige una categoría");

  let socialSubtype: SocialSubtype | null = null;
  let validUntil: string | null = null;
  if (input.categoria === "caso_social") {
    const raw = (input.subtipo ?? "").trim();
    if (!isSocialSubtype(raw)) throw new Error("Elige el subtipo del caso social");
    socialSubtype = raw;
    if (raw !== "adulto_mayor") {
      const vigencia = (input.vigencia ?? "").trim();
      if (!vigencia) throw new Error("Indica la vigencia del caso social");
      validUntil = vigencia;
    }
  }

  return {
    nombre,
    dni,
    phone,
    categoria: input.categoria,
    cargaFamiliar: parseCarga(input.carga),
    socialSubtype,
    validUntil,
    photoUrl: parsePhotoUrl(input.photoUrl),
    ...parseCare(input.careGroup, input.birthDate),
    comedor_id: input.comedor_id,
  };
}

export function validateCreateBeneficiary(input: {
  nombre: string;
  dni: string;
  pin: string;
  telefono?: string;
  categoria: string;
  carga?: string | number;
  subtipo?: string;
  vigencia?: string;
  photoUrl?: string | null;
  careGroup?: string;
  birthDate?: string;
  comedor_id: string;
}): CreateBeneficiaryInput {
  return {
    ...parseSharedFields(input),
    pin: validarPin(input.pin),
  };
}

export function validateUpdateBeneficiary(input: {
  id: string;
  nombre: string;
  dni: string;
  telefono?: string;
  categoria: string;
  carga?: string | number;
  subtipo?: string;
  vigencia?: string;
  photoUrl?: string | null;
  careGroup?: string;
  birthDate?: string;
  comedor_id: string;
}): UpdateBeneficiaryInput {
  if (!input.id) throw new Error("Falta la persona a editar");
  return {
    id: input.id,
    ...parseSharedFields(input),
  };
}

export function resolveKitchenAccountAction(facts: KitchenAccountFacts): KitchenAccountAction {
  if (facts.memberInThisKitchen) return "skip";
  if (facts.isSupervisor) return "reject_supervisor";
  if (facts.memberInOtherKitchen) return "skip";
  if (facts.hasAuthUser) return "link";
  return "create";
}

export function beneficiaryRow(
  data: CreateBeneficiaryInput,
  extra?: { direccion?: string | null; activo?: boolean; includePhoto?: boolean },
) {
  const row = {
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
  // Imports only carry the sheet's columns, so photo, care group and birth date stay as they are.
  if (extra?.includePhoto === false) return row;
  return { ...row, foto_url: data.photoUrl, care_group: data.careGroup, birth_date: data.birthDate };
}

export function staffToPadronRow(input: {
  comedor_id: string;
  nombre: string;
  dni: string;
  telefono?: string | null;
}) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Pon el nombre completo");
  const dni = input.dni.trim();
  if (!esDni(dni)) throw new Error("El DNI debe tener 8 dígitos");
  const phone = input.telefono?.trim() || null;
  if (phone && !/^\d{9}$/.test(phone)) throw new Error("El celular debe tener 9 dígitos");
  return {
    comedor_id: input.comedor_id,
    nombre_completo: nombre,
    dni,
    telefono: phone,
    categoria: "socia_familia" as const,
    carga_familiar: 0,
    subtipo_caso_social: null,
    vigencia_hasta: null,
    activo: true,
  };
}

export function canRemoveBeneficiary(cargo: string | null | undefined) {
  return !cargo || cargo === "socia";
}

export function padronStaffCargo(cargo: string | null | undefined): Cargo | null {
  if (!cargo || cargo === "socia") return null;
  if (cargo in CARGO_LABEL) return cargo as Cargo;
  return null;
}

export function friendlyCreateBeneficiaryError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("staff_in_padron")) {
    return "Esta persona es parte del personal. No se puede quitar del padrón.";
  }
  if (text.includes("usuarios_comedor_telefono_chk") || text.includes("beneficiarios_telefono")) {
    return "El celular debe tener 9 dígitos";
  }
  if (text.includes("usuarios_comedor_dni_chk") || text.includes("dni ~")) {
    return "El DNI debe tener 8 dígitos";
  }
  if (text.includes("already registered") || text.includes("already been registered") || text.includes("email address has already")) {
    return "Este DNI ya tiene una cuenta";
  }
  if (text.includes("duplicate") || text.includes("unique")) return "Esta persona ya está en el padrón";
  const looksTechnical = /violates|constraint|column|relation|permission denied|jwt|schema cache|exploded/.test(text);
  if (!text.trim() || looksTechnical) {
    return "No pudimos guardar a esta persona. Revisa los datos e inténtalo de nuevo.";
  }
  return message;
}

export const SUPERVISOR_PADRON_NOTE =
  "Se guardó en el padrón. Este DNI es supervisor y no puede ser integrante de una olla.";
