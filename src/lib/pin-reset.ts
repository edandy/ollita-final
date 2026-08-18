export const PIN_RESET_NOT_FOUND =
  "No encontramos una cuenta con ese DNI y celular. Revisá los datos.";

export const PIN_RESET_SENT =
  "Te escribimos por WhatsApp con tu PIN nuevo. Entrá con tu DNI y ese código.";

export const PIN_RESET_RATE_LIMITED =
  "Ya te enviamos un PIN. Revisá WhatsApp o esperá unos minutos para pedir otro.";

export const PIN_RESET_SEND_FAILED =
  "No pudimos enviarte el WhatsApp. Intentá de nuevo en unos minutos.";

export type PinResetOutcome = "sent" | "not_found" | "rate_limited" | "send_failed";

export function pinResetResponse(outcome: PinResetOutcome) {
  switch (outcome) {
    case "sent":
      return { ok: true as const, sent: true as const, message: PIN_RESET_SENT };
    case "not_found":
      return { ok: false as const, sent: false as const, message: PIN_RESET_NOT_FOUND };
    case "rate_limited":
      return { ok: true as const, sent: true as const, message: PIN_RESET_RATE_LIMITED };
    case "send_failed":
      return { ok: false as const, sent: false as const, message: PIN_RESET_SEND_FAILED };
  }
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PinResetAccount = {
  userId: string;
  dni: string;
  phone: string;
};

export type PinResetAttempt = {
  dni: string;
  phone: string;
  createdAt: string;
};

export function validatePinResetRequest(input: { dni?: string; phone?: string }) {
  const dni = (input.dni ?? "").replace(/\D/g, "");
  const phone = (input.phone ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(dni)) throw new Error("El DNI debe tener 8 dígitos");
  if (!/^\d{9}$/.test(phone)) throw new Error("El celular debe tener 9 dígitos");
  return { dni, phone };
}

export function generateResetPin() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function peruWhatsAppNumber(phone: string) {
  return `51${phone.replace(/\D/g, "")}`;
}

export function matchPinResetAccount(
  dni: string,
  phone: string,
  members: PinResetAccount[],
  supervisors: PinResetAccount[],
): PinResetAccount | null {
  const hits = [...members, ...supervisors].filter(
    (row) => row.dni === dni && row.phone === phone && row.userId,
  );
  const userIds = [...new Set(hits.map((row) => row.userId))];
  if (userIds.length !== 1) return null;
  return hits[0] ?? null;
}

export function isPinResetRateLimited(
  dni: string,
  phone: string,
  attempts: PinResetAttempt[],
  now = new Date(),
) {
  const related = attempts.filter((row) => row.dni === dni || row.phone === phone);
  const recent = related.filter((row) => now.getTime() - new Date(row.createdAt).getTime() < FIFTEEN_MIN_MS);
  if (recent.length >= 1) return true;
  const today = related.filter((row) => now.getTime() - new Date(row.createdAt).getTime() < DAY_MS);
  return today.length >= 3;
}
