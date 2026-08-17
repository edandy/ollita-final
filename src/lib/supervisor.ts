import { assertCanBeSupervisor, type AccessLevel } from "./access";
import { claveDePin, emailDeDni, esDni, validarPin } from "./dni-cuenta";

export type PlatformRole = "admin" | "supervisor";

export type CreatePlatformUserInput = {
  role: PlatformRole;
  name: string;
  dni: string;
  pin: string;
  phone: string | null;
  email: string;
  password: string;
  accessLevel: AccessLevel | null;
  comedorIds: string[];
};

export function parsePlatformRole(value: string): PlatformRole {
  if (value === "admin" || value === "supervisor") return value;
  throw new Error("Tipo de usuario inválido");
}

export function needsSupervisorFields(role: PlatformRole) {
  return role === "supervisor";
}

export function parseAccessLevel(value: string): AccessLevel {
  if (value === "view" || value === "full") return value;
  throw new Error("Nivel de acceso inválido");
}

export function validateCreatePlatformUser(input: {
  role: string;
  name: string;
  dni: string;
  pin: string;
  phone?: string;
  accessLevel?: string;
  comedorIds?: string[];
  isKitchenMember?: boolean;
}): CreatePlatformUserInput {
  assertCanBeSupervisor({ isKitchenMember: !!input.isKitchenMember });

  const role = parsePlatformRole(input.role);

  const name = input.name.trim();
  if (!name) throw new Error("Pon el nombre");

  const dni = input.dni.trim();
  if (!esDni(dni)) throw new Error("El DNI debe tener 8 números");

  const pin = validarPin(input.pin);
  const phone = input.phone?.trim() || null;

  let accessLevel: AccessLevel | null = null;
  let comedorIds: string[] = [];

  if (needsSupervisorFields(role)) {
    accessLevel = parseAccessLevel(input.accessLevel ?? "");
    comedorIds = [...new Set((input.comedorIds ?? []).filter(Boolean))];
    if (comedorIds.length === 0) throw new Error("Asigna al menos una olla");
  }

  return {
    role,
    name,
    dni,
    pin,
    phone,
    email: emailDeDni(dni),
    password: claveDePin(dni, pin),
    accessLevel,
    comedorIds,
  };
}

export function validateUpdatePlatformUser(input: {
  userId: string;
  name: string;
  role: string;
  accessLevel?: string;
  comedorIds?: string[];
}) {
  if (!input.userId) throw new Error("Usuario inválido");
  const name = input.name.trim();
  if (!name) throw new Error("Pon el nombre");
  const role = parsePlatformRole(input.role);
  let accessLevel: AccessLevel | null = null;
  let comedorIds: string[] = [];
  if (needsSupervisorFields(role)) {
    accessLevel = parseAccessLevel(input.accessLevel ?? "");
    comedorIds = [...new Set((input.comedorIds ?? []).filter(Boolean))];
    if (comedorIds.length === 0) throw new Error("Asigna al menos una olla");
  }
  return { userId: input.userId, name, role, accessLevel, comedorIds };
}

export function friendlyCreatePlatformUserError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("invalid input value for enum") || text.includes("app_role")) {
    return "No se pudo crear el supervisor. Falta configurar el rol en la base de datos.";
  }
  if (text.includes("already registered") || text.includes("already been registered") || text.includes("email address has already")) {
    return "Este DNI ya tiene una cuenta";
  }
  if (text.includes("duplicate") || text.includes("unique")) {
    return "Esa persona ya tiene una cuenta de plataforma";
  }
  const looksTechnical = /violates|constraint|column|relation|permission|jwt|undefined|null value|schema cache|exploded/.test(text);
  if (!text.trim() || looksTechnical) {
    return "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.";
  }
  return message;
}
