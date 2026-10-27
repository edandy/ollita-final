import { isPadronChannel, shiftWeek, weekRangeMonSat } from "./g1";
import { g2Cutoff } from "./g2";
import { dishKey, monthRange } from "./g3";

export const G9_WEEKS = 8;
/** A kitchen whose last record is older than this many days is flagged. */
export const G9_STALE_DAYS = 7;
/** Closed cash days whose stored income differs from their sales by more than this are unbalanced. */
const CASH_TOLERANCE = 0.5;
const CODE_RE = /[EL][A-Z0-9]{5}-[A-Z0-9]{4}/g;

export type G9Kitchen = { id: string; nombre: string };
export type G9Activity = { user_id: string; comedor_id: string; day: string };
/** Any dated record of a kitchen: menus, almacén movements and shifts. */
export type G9Dated = { comedor_id: string; fecha: string };
export type G9CashDay = { id: string; comedor_id: string; fecha: string; cerrado: boolean; total_ingresos: number };
export type G9Transaction = { caja_dia_id: string; tipo: string; categoria: string; monto: number; nota: string | null };
/** A `recogida` reservation, dated by its menu. */
export type G9Pickup = {
  id: string;
  comedor_id: string;
  codigo: string;
  cantidad: number;
  fecha: string;
  beneficiario_id: string | null;
};
export type G9Person = { comedor_id: string; dni: string; nombre_completo: string };

const MODULES = [
  { key: "menu", label: "Menú" },
  { key: "padron", label: "Padrón" },
  { key: "caja", label: "Caja" },
  { key: "insumos", label: "Insumos" },
  { key: "turnos", label: "Turnos" },
] as const;

export function extractReservationCodes(note: string | null) {
  return (note ?? "").toUpperCase().match(CODE_RE) ?? [];
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function buildG9Report(input: {
  groupName: string;
  groupSince: string;
  weekStart: string;
  today: string;
  kitchens: G9Kitchen[];
  activity: G9Activity[];
  menus: G9Dated[];
  cashDays: G9CashDay[];
  transactions: G9Transaction[];
  debts: { reservation_id: string | null }[];
  pickups: G9Pickup[];
  /** `pendiente` reservations, dated by their menu. */
  pending: G9Dated[];
  people: G9Person[];
  movements: G9Dated[];
  shifts: G9Dated[];
}) {
  const range = weekRangeMonSat(input.weekStart);
  const cutoff = g2Cutoff(range.to, input.today);
  const week = { ...range, cutoff };
  const inWeek = (fecha: string) => fecha >= range.from && fecha <= cutoff;
  const last7 = (day: string) => day > addDays(cutoff, -7) && day <= cutoff;
  const prev7 = (day: string) => day > addDays(cutoff, -14) && day <= addDays(cutoff, -7);
  const last30 = (day: string) => day > addDays(cutoff, -30) && day <= cutoff;

  const records: G9Dated[] = [
    ...input.menus,
    ...input.cashDays.map(({ comedor_id, fecha }) => ({ comedor_id, fecha })),
    ...input.movements,
    ...input.shifts,
  ].filter((r) => r.fecha <= cutoff);
  const activeIn = (test: (fecha: string) => boolean) => new Set(records.filter((r) => test(r.fecha)).map((r) => r.comedor_id));

  const salesByKitchen = new Map<string, Set<string>>();
  const incomeByCash = new Map<string, number>();
  const cashKitchen = new Map(input.cashDays.map((c) => [c.id, c.comedor_id]));
  for (const t of input.transactions) {
    if (t.tipo !== "ingreso") continue;
    incomeByCash.set(t.caja_dia_id, (incomeByCash.get(t.caja_dia_id) ?? 0) + (Number(t.monto) || 0));
    const kitchenId = cashKitchen.get(t.caja_dia_id);
    if (t.categoria !== "venta_menus" || !kitchenId) continue;
    const codes = salesByKitchen.get(kitchenId) ?? new Set<string>();
    for (const code of extractReservationCodes(t.nota)) codes.add(code);
    salesByKitchen.set(kitchenId, codes);
  }
  const onCredit = new Set(input.debts.map((d) => d.reservation_id).filter(Boolean));
  const weekPickups = input.pickups.filter((p) => inWeek(p.fecha));

  const kitchens = input.kitchens.map((k) => {
    const own = records.filter((r) => r.comedor_id === k.id);
    const hasData = own.some((r) => inWeek(r.fecha));
    const users = new Set(input.activity.filter((a) => a.comedor_id === k.id && last7(a.day)).map((a) => a.user_id)).size;
    const lastRecord = own.reduce<string | null>((m, r) => (m == null || r.fecha > m ? r.fecha : m), null);
    const unbalanced = input.cashDays.filter(
      (c) =>
        c.comedor_id === k.id &&
        c.cerrado &&
        inWeek(c.fecha) &&
        Math.abs((Number(c.total_ingresos) || 0) - (incomeByCash.get(c.id) ?? 0)) > CASH_TOLERANCE,
    ).length;
    const sold = salesByKitchen.get(k.id) ?? new Set<string>();
    const unpaid = weekPickups.filter(
      (p) => p.comedor_id === k.id && !onCredit.has(p.id) && !sold.has(p.codigo.toUpperCase()),
    ).length;
    const dniByName = new Map<string, Set<string>>();
    for (const p of input.people.filter((x) => x.comedor_id === k.id)) {
      const name = dishKey(p.nombre_completo);
      dniByName.set(name, (dniByName.get(name) ?? new Set<string>()).add(p.dni.trim()));
    }
    const duplicates = [...dniByName.values()].reduce((s, dnis) => s + Math.max(0, dnis.size - 1), 0);
    const pending = input.pending.filter(
      (p) => p.comedor_id === k.id && inWeek(p.fecha) && p.fecha < input.today,
    ).length;
    const has = (list: G9Dated[]) => list.some((r) => r.comedor_id === k.id && inWeek(r.fecha));
    const complete =
      has(input.menus) && has(input.cashDays.map(({ comedor_id, fecha }) => ({ comedor_id, fecha }))) && has(input.movements);
    return {
      id: k.id,
      nombre: k.nombre,
      hasData,
      users,
      lastRecord,
      stale: lastRecord == null || lastRecord <= addDays(cutoff, -G9_STALE_DAYS),
      unbalanced,
      unpaid,
      duplicates,
      pending,
      complete,
    };
  });

  const problems = (k: (typeof kitchens)[number]) => k.unbalanced + k.unpaid + k.duplicates + k.pending;
  kitchens.sort(
    (a, b) =>
      Number(b.hasData) - Number(a.hasData) || problems(b) - problems(a) || a.nombre.localeCompare(b.nombre, "es"),
  );
  const withData = kitchens.filter((k) => k.hasData);
  const sum = (key: "unbalanced" | "unpaid" | "duplicates" | "pending") => withData.reduce((s, k) => s + k[key], 0);

  const weeks = Array.from({ length: G9_WEEKS }, (_, i) => {
    const from = shiftWeek(range.from, i - (G9_WEEKS - 1));
    const to = weekRangeMonSat(from).to;
    const [, m, d] = from.split("-");
    return { label: `${Number(d)}/${Number(m)}`, active: activeIn((f) => f >= from && f <= to).size };
  });

  const month = monthRange(cutoff);
  const inMonth = (fecha: string) => fecha >= month.from && fecha <= cutoff;
  const kitchensWith = (list: G9Dated[]) => new Set(list.filter((r) => inMonth(r.fecha)).map((r) => r.comedor_id)).size;
  const moduleCounts: Record<(typeof MODULES)[number]["key"], number> = {
    menu: kitchensWith(input.menus),
    padron: kitchensWith(input.pickups.filter((p) => isPadronChannel(p))),
    caja: kitchensWith(input.cashDays),
    insumos: kitchensWith(input.movements),
    turnos: kitchensWith(input.shifts),
  };

  const usersNow = new Set(input.activity.filter((a) => last7(a.day)).map((a) => a.user_id)).size;
  const usersBefore = new Set(input.activity.filter((a) => prev7(a.day)).map((a) => a.user_id)).size;

  return {
    groupName: input.groupName,
    groupSince: ddmmyyyy(input.groupSince),
    week,
    coverage: { withData: withData.length, total: input.kitchens.length },
    activeKitchens: { days7: activeIn(last7).size, days30: activeIn(last30).size },
    users: { current: usersNow, delta: usersNow - usersBefore },
    servings: weekPickups.reduce((s, p) => s + (Number(p.cantidad) || 0), 0),
    people: new Set(input.people.map((p) => p.dni.trim())).size,
    weeks,
    month: { label: month.label.split(" ")[0]!.toLowerCase() },
    modules: MODULES.map((m) => ({ key: m.key, label: m.label, kitchens: moduleCounts[m.key] })),
    kitchens,
    totals: {
      users: kitchens.reduce((s, k) => s + k.users, 0),
      unbalanced: sum("unbalanced"),
      unpaid: sum("unpaid"),
      duplicates: sum("duplicates"),
      pending: sum("pending"),
      complete: kitchens.filter((k) => k.complete).length,
    },
  };
}

export type G9Report = ReturnType<typeof buildG9Report>;
