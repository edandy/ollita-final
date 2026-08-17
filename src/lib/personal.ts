import { esDni, validarPin } from "./dni-cuenta";

export type StaffCargo =
  | "vicepresidenta"
  | "tesorera"
  | "almacenera"
  | "cocinera"
  | "secretaria"
  | "fiscal"
  | "vocal"
  | "socia";

export const STAFF_CARGOS: StaffCargo[] = [
  "vicepresidenta", "tesorera", "almacenera", "cocinera",
  "secretaria", "fiscal", "vocal", "socia",
];

export type AssignableStaffCargo = Exclude<StaffCargo, "socia">;

export const ASSIGNABLE_STAFF_CARGOS: AssignableStaffCargo[] = [
  "vicepresidenta", "tesorera", "almacenera", "cocinera",
  "secretaria", "fiscal", "vocal",
];

export type AssignStaffInput = {
  beneficiaryId: string;
  cargo: AssignableStaffCargo;
  comedor_id: string;
};

export type CreateStaffInput = {
  nombre: string;
  dni: string;
  pin: string;
  phone: string | null;
  cargo: StaffCargo;
  comedor_id: string;
};

function isStaffCargo(value: string): value is StaffCargo {
  return (STAFF_CARGOS as string[]).includes(value);
}

function isAssignableStaffCargo(value: string): value is AssignableStaffCargo {
  return (ASSIGNABLE_STAFF_CARGOS as string[]).includes(value);
}

export function validateCreateStaff(input: {
  nombre: string;
  dni: string;
  pin: string;
  telefono?: string;
  cargo: string;
  comedor_id: string;
}): CreateStaffInput {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Pon el nombre completo");

  const dni = input.dni.trim();
  if (!esDni(dni)) throw new Error("El DNI debe tener 8 dígitos");

  const pin = validarPin(input.pin);

  const phone = input.telefono?.trim() || null;
  if (phone && !/^\d{9}$/.test(phone)) throw new Error("El celular debe tener 9 dígitos");

  if (!isStaffCargo(input.cargo)) throw new Error("Elige un cargo");

  return {
    nombre,
    dni,
    pin,
    phone,
    cargo: input.cargo,
    comedor_id: input.comedor_id,
  };
}

export function validateAssignStaffFromPadron(input: {
  beneficiary_id: string;
  cargo: string;
  comedor_id: string;
}): AssignStaffInput {
  const beneficiaryId = input.beneficiary_id.trim();
  if (!beneficiaryId) throw new Error("Elige a alguien del padrón");

  const comedor_id = input.comedor_id.trim();
  if (!comedor_id) throw new Error("Falta la olla");

  if (!isAssignableStaffCargo(input.cargo)) throw new Error("Elige un cargo");

  return { beneficiaryId, cargo: input.cargo, comedor_id };
}

export function friendlyAssignStaffError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("duplicate") || text.includes("unique")) return "Esta persona ya está en el equipo";
  const looksTechnical = /violates|constraint|column|relation|permission denied|jwt|schema cache|exploded/.test(text);
  if (!text.trim() || looksTechnical) {
    return "No pudimos asignar el cargo. Revisa los datos e inténtalo de nuevo.";
  }
  return message;
}

export function friendlyCreateStaffError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("usuarios_comedor_telefono_chk")) return "El celular debe tener 9 dígitos";
  if (text.includes("usuarios_comedor_dni_chk")) return "El DNI debe tener 8 dígitos";
  if (text.includes("already registered") || text.includes("already been registered") || text.includes("email address has already")) {
    return "Este DNI ya tiene una cuenta";
  }
  if (text.includes("duplicate") || text.includes("unique")) return "Esta persona ya está en el equipo";
  return "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.";
}
