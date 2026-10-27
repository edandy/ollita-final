import { friendlySupabaseError } from "./supabase-errors";

export type DonorRow = { id: string; name: string; donations: number };
export type DonationRow = {
  id: string;
  code: string;
  donorId: string;
  donorName: string;
  groupId: string;
  groupName: string;
  receivedOn: string;
  /** Kitchens that recorded their share. */
  kitchens: number;
};

const CODE_RE = /^D-(\d{4})-(\d{3,})$/;

export function validateDonorName(value: string) {
  const name = value.trim();
  if (!name) throw new Error("Escribe el nombre del donante.");
  return name;
}

export function validateDonationCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new Error("Escribe el código del lote, por ejemplo D-2026-044.");
  return code;
}

export function nextDonationCode(codes: string[], year: number) {
  const max = codes.reduce((m, c) => {
    const match = CODE_RE.exec(c.toUpperCase());
    return match && Number(match[1]) === year ? Math.max(m, Number(match[2])) : m;
  }, 0);
  return `D-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function friendlyDonationError(message: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("duplicate") || text.includes("unique")) {
    return text.includes("donors") ? "Ya existe un donante con ese nombre." : "Ya existe un lote con ese código.";
  }
  if (text.includes("foreign key") && text.includes("donors")) {
    return "Este donante tiene lotes registrados. Elimina primero sus lotes.";
  }
  return friendlySupabaseError(message);
}
