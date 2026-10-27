import { formatG1Number, weekRangeMonSat } from "@/lib/g1";

export const G2_ALERT_DAYS = 4;
export const G2_CRITICAL_DAYS = 2;
export const G2_SHOPPING_DAYS = 10;
export const G2_USAGE_WINDOW_DAYS = 30;
export const G2_DAYS_CAP = 30;

export type G2Unit = "kg" | "L" | "unid";

export type G2Kitchen = { id: string; nombre: string };

export type G2Supply = {
  id: string;
  comedor_id: string;
  nombre: string;
  unidad: G2Unit;
  stock_actual: number;
  precio_referencial: number | null;
};

export type G2Movement = {
  insumo_id: string;
  tipo: "ingreso" | "salida" | string;
  cantidad: number;
  fecha: string;
  precio_unitario: number | null;
};

export type G2SupplyRow = {
  key: string;
  label: string;
  unit: G2Unit;
  stock: number;
  dailyUse: number;
  inAlert: number;
  runsOutBeforeNext: number;
};

export type G2KitchenRow = {
  id: string;
  nombre: string;
  hasData: boolean;
  days: (number | null)[];
};

export type G2ShoppingRow = {
  key: string;
  label: string;
  unit: G2Unit;
  quantity: number;
  kitchens: number;
};

export type G2Report = {
  groupName: string;
  week: { from: string; to: string; label: string };
  cutoff: { date: string; label: string };
  nextCutoff: { date: string; label: string };
  coverage: { withData: number; total: number };
  totals: {
    stockValue: number;
    catalogSize: number;
    kitchensInAlert: number;
    kitchensCritical: number;
  };
  supplies: G2SupplyRow[];
  basics: { key: string; label: string }[];
  kitchens: G2KitchenRow[];
  shopping: G2ShoppingRow[];
};

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function supplyKey(nombre: string, unidad: string) {
  const name = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return `${name}|${unidad}`;
}

export function stockAtCutoff(
  current: number,
  cutoff: string,
  movements: Pick<G2Movement, "tipo" | "cantidad" | "fecha">[],
) {
  let stock = Number(current) || 0;
  for (const m of movements) {
    if (m.fecha <= cutoff) continue;
    const qty = Number(m.cantidad) || 0;
    stock += m.tipo === "ingreso" ? -qty : m.tipo === "salida" ? qty : 0;
  }
  return Math.max(0, stock);
}

// Same rule as the kitchen's Almacén screen: outflows of the last 30 days divided by the days with outflows.
export function dailyUsage(cutoff: string, movements: Pick<G2Movement, "tipo" | "cantidad" | "fecha">[]) {
  const from = addDaysISO(cutoff, -(G2_USAGE_WINDOW_DAYS - 1));
  let total = 0;
  const days = new Set<string>();
  for (const m of movements) {
    if (m.tipo !== "salida" || m.fecha < from || m.fecha > cutoff) continue;
    total += Number(m.cantidad) || 0;
    days.add(m.fecha);
  }
  return days.size ? total / days.size : 0;
}

export function coverageDays(stock: number, usage: number) {
  if (!usage || usage <= 0) return null;
  return Math.floor(Math.max(0, stock) / usage);
}

export function g2Cutoff(weekTo: string, today: string) {
  return today < weekTo ? today : weekTo;
}

export function g2CutoffLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  const weekday = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${weekday} ${d}/${m}/${y}`;
}

export function formatG2Quantity(qty: number, unit: string) {
  return `${formatG1Number(qty)} ${unit}`;
}

export function formatG2Money(n: number) {
  return `S/ ${formatG1Number(n)}`;
}

export function formatG2Days(days: number | null) {
  if (days == null) return "—";
  return days > G2_DAYS_CAP ? `${G2_DAYS_CAP}+` : String(days);
}

export function isG2Alert(days: number | null) {
  return days != null && days < G2_ALERT_DAYS;
}

/** Reference price, or the latest purchase price up to `asOf`. */
export function supplyPrice(
  precioReferencial: number | null,
  movements: Pick<G2Movement, "tipo" | "fecha" | "precio_unitario">[],
  asOf: string,
) {
  if (precioReferencial != null) return precioReferencial;
  const lastPurchase = movements
    .filter((m) => m.tipo === "ingreso" && m.precio_unitario != null && m.fecha <= asOf)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return lastPurchase?.precio_unitario ?? null;
}

export function averagePrice(prices: (number | null)[]) {
  const known = prices.filter((p): p is number => p != null);
  return known.length ? known.reduce((s, p) => s + p, 0) / known.length : null;
}

type KitchenSupply = {
  key: string;
  label: string;
  unit: G2Unit;
  comedorId: string;
  stock: number;
  usage: number;
  days: number | null;
  price: number | null;
};

export function buildG2Report(input: {
  groupName: string;
  weekStart: string;
  today: string;
  kitchens: G2Kitchen[];
  supplies: G2Supply[];
  movements: G2Movement[];
}): G2Report {
  const week = weekRangeMonSat(input.weekStart);
  const cutoff = g2Cutoff(week.to, input.today);
  const next = addDaysISO(cutoff, 7);
  const [, nm, nd] = next.split("-");

  const movesBySupply = new Map<string, G2Movement[]>();
  for (const m of input.movements) {
    const list = movesBySupply.get(m.insumo_id) ?? [];
    list.push(m);
    movesBySupply.set(m.insumo_id, list);
  }

  const activeKitchens = new Set<string>();
  for (const s of input.supplies) {
    const moved = (movesBySupply.get(s.id) ?? []).some((m) => m.fecha >= week.from && m.fecha <= cutoff);
    if (moved) activeKitchens.add(s.comedor_id);
  }

  const labelVotes = new Map<string, Map<string, number>>();
  const rows: KitchenSupply[] = [];
  for (const s of input.supplies) {
    if (!activeKitchens.has(s.comedor_id)) continue;
    const moves = movesBySupply.get(s.id) ?? [];
    const key = supplyKey(s.nombre, s.unidad);
    const label = s.nombre.trim().replace(/\s+/g, " ");
    const votes = labelVotes.get(key) ?? new Map<string, number>();
    votes.set(label, (votes.get(label) ?? 0) + 1);
    labelVotes.set(key, votes);

    const stock = stockAtCutoff(s.stock_actual, cutoff, moves);
    const usage = dailyUsage(cutoff, moves);
    rows.push({
      key,
      label,
      unit: s.unidad,
      comedorId: s.comedor_id,
      stock,
      usage,
      days: coverageDays(stock, usage),
      price: supplyPrice(s.precio_referencial, moves, cutoff),
    });
  }

  const labelFor = (key: string) => {
    const votes = [...(labelVotes.get(key) ?? new Map()).entries()];
    votes.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
    const label = votes[0]?.[0] ?? key;
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const byKey = new Map<string, KitchenSupply[]>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }

  const supplies: G2SupplyRow[] = [...byKey.entries()].map(([key, list]) => ({
    key,
    label: labelFor(key),
    unit: list[0].unit,
    stock: list.reduce((s, r) => s + r.stock, 0),
    dailyUse: list.reduce((s, r) => s + r.usage, 0),
    inAlert: list.filter((r) => isG2Alert(r.days)).length,
    runsOutBeforeNext: list.filter((r) => r.days != null && r.days < 7).length,
  }));
  supplies.sort(
    (a, b) =>
      b.inAlert - a.inAlert ||
      b.runsOutBeforeNext - a.runsOutBeforeNext ||
      b.dailyUse - a.dailyUse ||
      a.label.localeCompare(b.label, "es"),
  );

  const stockValue = rows.reduce((sum, r) => {
    const price = r.price ?? averagePrice((byKey.get(r.key) ?? []).map((x) => x.price)) ?? 0;
    return sum + r.stock * price;
  }, 0);

  // Most widely used supplies first; ties follow the alert ranking, never raw volume (units differ).
  const users = (key: string) => (byKey.get(key) ?? []).filter((r) => r.usage > 0).length;
  const rank = new Map(supplies.map((s, i) => [s.key, i]));
  const basics = supplies
    .filter((s) => s.dailyUse > 0)
    .sort((a, b) => users(b.key) - users(a.key) || rank.get(a.key)! - rank.get(b.key)!)
    .slice(0, 4)
    .map((s) => ({ key: s.key, label: s.label }));

  const kitchens: G2KitchenRow[] = input.kitchens.map((k) => {
    const hasData = activeKitchens.has(k.id);
    return {
      id: k.id,
      nombre: k.nombre,
      hasData,
      days: basics.map((b) =>
        hasData ? rows.find((r) => r.comedorId === k.id && r.key === b.key)?.days ?? null : null,
      ),
    };
  });
  const withData = kitchens.filter((k) => k.hasData).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const withoutData = kitchens.filter((k) => !k.hasData).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const kitchenWorst = new Map<string, number>();
  for (const r of rows) {
    if (r.days == null) continue;
    kitchenWorst.set(r.comedorId, Math.min(kitchenWorst.get(r.comedorId) ?? Infinity, r.days));
  }
  const worst = [...kitchenWorst.values()];

  const shopping: G2ShoppingRow[] = [...byKey.entries()]
    .map(([key, list]) => {
      const needs = list.map((r) => r.usage * G2_SHOPPING_DAYS - r.stock).filter((n) => n > 0);
      return {
        key,
        label: labelFor(key),
        unit: list[0].unit,
        quantity: Math.ceil(needs.reduce((s, n) => s + n, 0)),
        kitchens: needs.length,
      };
    })
    .filter((s) => s.kitchens > 0)
    .sort((a, b) => b.kitchens - a.kitchens || b.quantity - a.quantity || a.label.localeCompare(b.label, "es"));

  return {
    groupName: input.groupName,
    week,
    cutoff: { date: cutoff, label: g2CutoffLabel(cutoff) },
    nextCutoff: { date: next, label: `${nd}/${nm}` },
    coverage: { withData: withData.length, total: kitchens.length },
    totals: {
      stockValue: Math.round(stockValue),
      catalogSize: supplies.length,
      kitchensInAlert: worst.filter((d) => d < G2_ALERT_DAYS).length,
      kitchensCritical: worst.filter((d) => d <= G2_CRITICAL_DAYS).length,
    },
    supplies,
    basics,
    kitchens: [...withData, ...withoutData],
    shopping,
  };
}
