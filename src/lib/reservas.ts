const STATUS_ORDER: Record<string, number> = {
  pendiente: 0,
  no_recogida: 1,
  recogida: 2,
};

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChars(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!;
  }
  return s;
}

export function generateKitchenCode() {
  return randomChars(5);
}

export function isKitchenCode(value: unknown): value is string {
  return typeof value === "string" && value.length === 5 && [...value].every((c) => CODE_ALPHABET.includes(c));
}

export function generateReservationCode({
  kitchenCode,
  enrolled,
}: {
  kitchenCode: string;
  enrolled: boolean;
}) {
  return `${enrolled ? "E" : "L"}${kitchenCode}-${randomChars(4)}`;
}

export function isUniqueViolation(message: string) {
  const text = (message ?? "").toLowerCase();
  return text.includes("duplicate") || text.includes("unique");
}

export async function retryOnUniqueViolation<T extends { error: { message: string } | null }>(
  run: () => Promise<T>,
  attempts = 8,
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await run();
    if (!last.error || !isUniqueViolation(last.error.message)) return last;
  }
  return last!;
}

export function sortReservasForPanel<T extends { estado: string; created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.estado] ?? 1) - (STATUS_ORDER[b.estado] ?? 1);
    if (byStatus !== 0) return byStatus;
    return b.created_at.localeCompare(a.created_at);
  });
}
