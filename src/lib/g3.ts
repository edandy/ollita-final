import { formatG1Number, preparedServings } from "@/lib/g1";
import { averagePrice, supplyKey, supplyPrice, type G2Movement, type G2Supply } from "@/lib/g2";

export const G3_BASELINE_MONTHS = 3;
export const G3_HIGH_YIELD_FACTOR = 1.5;
export const G3_YIELD_ROWS = 5;
export const G3_TOP_DISHES = 4;
export const G3_REPEAT_RUN = 3;

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// Matched as whole words against the normalized dish name.
const ANIMAL_PROTEIN = [
  "pollo",
  "gallina",
  "carne",
  "res",
  "bistec",
  "pescado",
  "jurel",
  "bonito",
  "atun",
  "caballa",
  "huevo",
  "higado",
  "sangrecita",
  "cerdo",
  "chancho",
  "pavo",
  "mondongo",
  "cau cau",
  "seco de",
  "lomo",
];

export type G3Menu = {
  id: string;
  comedor_id: string;
  fecha: string;
  nombre_plato: string;
  publicado: boolean;
  raciones_disponibles: number;
};

export type G3Reservation = {
  menu_id: string;
  comedor_id: string;
  cantidad: number;
  estado: string;
};

export type G3YieldRow = {
  key: string;
  label: string;
  unit: "g" | "ml";
  group: number;
  min: number;
  max: number;
  maxKitchen: string;
  high: boolean;
};

export type G3Report = {
  groupName: string;
  /** Last day counted when the month is still running, otherwise null. */
  month: { from: string; to: string; label: string; until: string | null };
  coverage: { withData: number; total: number };
  prepared: number;
  cost: { perServing: number; min: number; max: number };
  merma: number | null;
  unserved: { servings: number; rate: number; cost: number };
  dishes: { average: number; min: number; max: number };
  yields: G3YieldRow[];
  kitchenCosts: { id: string; nombre: string; cost: number }[];
  variety: {
    proteinRate: number;
    leastVaried: { nombre: string; dishes: number } | null;
    repeatedKitchens: number;
    topDishes: { label: string; rate: number }[];
  };
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function monthRange(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}`, label: `${MONTHS[m - 1]} ${y}` };
}

export function shiftMonth(iso: string, months: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

export function baselineRange(monthFrom: string) {
  return {
    from: shiftMonth(monthFrom, -G3_BASELINE_MONTHS),
    to: monthRange(shiftMonth(monthFrom, -1)).to,
  };
}

export function dishKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function isAnimalProtein(dish: string) {
  const name = ` ${dishKey(dish).replace(/[^a-z ]/g, " ")} `;
  return ANIMAL_PROTEIN.some((word) => name.includes(` ${word} `) || name.includes(` ${word}s `));
}

export function formatG3Money(n: number) {
  return `S/ ${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

export function formatG3Percent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatG3Yield(value: number, unit: string) {
  return `${formatG1Number(value)} ${unit}`;
}

function mostCommonLabel(labels: string[]) {
  const votes = new Map<string, number>();
  for (const l of labels) votes.set(l, (votes.get(l) ?? 0) + 1);
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0]?.[0] ?? "";
  return best.charAt(0).toUpperCase() + best.slice(1);
}

function cleanLabel(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function buildG3Report(input: {
  groupName: string;
  monthStart: string;
  today: string;
  kitchens: { id: string; nombre: string }[];
  menus: G3Menu[];
  reservations: G3Reservation[];
  supplies: G2Supply[];
  movements: G2Movement[];
}): G3Report {
  const range = monthRange(input.monthStart);
  // A running month stops at today: menus published for later days have no outflows or pickups yet.
  const until = input.today < range.to ? input.today : null;
  const month = { ...range, until };
  const periodEnd = until ?? range.to;
  const base = baselineRange(month.from);
  const inMonth = (fecha: string) => fecha >= month.from && fecha <= periodEnd;
  const inBase = (fecha: string) => fecha >= base.from && fecha <= base.to;

  const menus = input.menus.filter((m) => m.publicado);
  const reserved = new Map<string, number>();
  const delivered = new Map<string, number>();
  for (const r of input.reservations) {
    reserved.set(r.menu_id, (reserved.get(r.menu_id) ?? 0) + r.cantidad);
    if (r.estado === "recogida") delivered.set(r.menu_id, (delivered.get(r.menu_id) ?? 0) + r.cantidad);
  }
  const servings = (kitchenId: string, within: (fecha: string) => boolean) => {
    let prepared = 0;
    let served = 0;
    for (const m of menus) {
      if (m.comedor_id !== kitchenId || !within(m.fecha)) continue;
      prepared += preparedServings(m.raciones_disponibles, reserved.get(m.id) ?? 0);
      served += delivered.get(m.id) ?? 0;
    }
    return { prepared, served };
  };

  const movesBySupply = new Map<string, G2Movement[]>();
  for (const m of input.movements) {
    const list = movesBySupply.get(m.insumo_id) ?? [];
    list.push(m);
    movesBySupply.set(m.insumo_id, list);
  }
  const outflow = (supplyId: string, within: (fecha: string) => boolean) =>
    (movesBySupply.get(supplyId) ?? [])
      .filter((m) => m.tipo === "salida" && !m.transfer_id && within(m.fecha))
      .reduce((s, m) => s + (Number(m.cantidad) || 0), 0);

  const monthEnd = periodEnd;
  const kitchenRows = input.kitchens.map((k) => {
    const month = servings(k.id, inMonth);
    const baseline = servings(k.id, inBase);
    const supplies = input.supplies
      .filter((s) => s.comedor_id === k.id)
      .map((s) => ({
        supply: s,
        key: supplyKey(s.nombre, s.unidad),
        used: outflow(s.id, inMonth),
        usedBefore: outflow(s.id, inBase),
        price: supplyPrice(s.precio_referencial, movesBySupply.get(s.id) ?? [], monthEnd),
      }));
    const hasData = month.prepared > 0 && supplies.some((s) => s.used > 0);
    return { kitchen: k, month, baseline, supplies, hasData };
  });
  const active = kitchenRows.filter((k) => k.hasData);

  const pricesByKey = new Map<string, (number | null)[]>();
  for (const k of active) {
    for (const s of k.supplies) pricesByKey.set(s.key, [...(pricesByKey.get(s.key) ?? []), s.price]);
  }
  const priceOf = (s: { key: string; price: number | null }) => s.price ?? averagePrice(pricesByKey.get(s.key) ?? []);

  const prepared = active.reduce((s, k) => s + k.month.prepared, 0);
  const kitchenCosts = active
    .map((k) => ({
      id: k.kitchen.id,
      nombre: k.kitchen.nombre,
      cost: k.supplies.reduce((sum, s) => sum + s.used * (priceOf(s) ?? 0), 0) / k.month.prepared,
      total: k.supplies.reduce((sum, s) => sum + s.used * (priceOf(s) ?? 0), 0),
    }))
    .sort((a, b) => b.cost - a.cost || a.nombre.localeCompare(b.nombre, "es"));
  const totalCost = kitchenCosts.reduce((s, k) => s + k.total, 0);
  const perServing = prepared > 0 ? totalCost / prepared : 0;

  let excessCost = 0;
  let expectedCost = 0;
  for (const k of active) {
    if (k.baseline.prepared <= 0) continue;
    for (const s of k.supplies) {
      const price = priceOf(s);
      if (price == null || s.usedBefore <= 0) continue;
      const expected = (s.usedBefore / k.baseline.prepared) * k.month.prepared;
      excessCost += Math.max(0, s.used - expected) * price;
      expectedCost += expected * price;
    }
  }

  const unservedServings = active.reduce((s, k) => s + Math.max(0, k.month.prepared - k.month.served), 0);

  const yieldGroups = new Map<string, { labels: string[]; unit: "g" | "ml"; rows: { nombre: string; used: number; prepared: number }[] }>();
  for (const k of active) {
    for (const s of k.supplies) {
      if (s.used <= 0 || (s.supply.unidad !== "kg" && s.supply.unidad !== "L")) continue;
      const g = yieldGroups.get(s.key) ?? { labels: [], unit: s.supply.unidad === "kg" ? "g" : "ml", rows: [] };
      g.labels.push(cleanLabel(s.supply.nombre));
      g.rows.push({ nombre: k.kitchen.nombre, used: s.used * 1000, prepared: k.month.prepared });
      yieldGroups.set(s.key, g);
    }
  }
  const yields = [...yieldGroups.entries()]
    .map(([key, g]) => {
      const perKitchen = g.rows.map((r) => ({ nombre: r.nombre, value: r.used / r.prepared }));
      const group = g.rows.reduce((s, r) => s + r.used, 0) / g.rows.reduce((s, r) => s + r.prepared, 0);
      const top = [...perKitchen].sort((a, b) => b.value - a.value || a.nombre.localeCompare(b.nombre, "es"))[0];
      const max = top.value;
      return {
        key,
        label: mostCommonLabel(g.labels),
        unit: g.unit,
        group,
        min: Math.min(...perKitchen.map((p) => p.value)),
        max,
        maxKitchen: top.nombre,
        high: max >= group * G3_HIGH_YIELD_FACTOR,
        kitchens: g.rows.length,
        total: g.rows.reduce((s, r) => s + r.used, 0),
      };
    })
    .sort((a, b) => b.kitchens - a.kitchens || b.total - a.total || a.label.localeCompare(b.label, "es"))
    .slice(0, G3_YIELD_ROWS)
    .map(({ kitchens: _k, total: _t, ...row }) => row);

  const activeIds = new Set(active.map((k) => k.kitchen.id));
  const monthMenus = menus
    .filter((m) => activeIds.has(m.comedor_id) && inMonth(m.fecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const dishCounts = active.map((k) => ({
    nombre: k.kitchen.nombre,
    dishes: new Set(monthMenus.filter((m) => m.comedor_id === k.kitchen.id).map((m) => dishKey(m.nombre_plato))).size,
  }));
  const repeatedKitchens = active.filter((k) => {
    const keys = monthMenus.filter((m) => m.comedor_id === k.kitchen.id).map((m) => dishKey(m.nombre_plato));
    return keys.some((key, i) => i >= G3_REPEAT_RUN - 1 && keys.slice(i - G3_REPEAT_RUN + 1, i + 1).every((x) => x === key));
  }).length;
  const byDish = new Map<string, string[]>();
  for (const m of monthMenus) {
    const key = dishKey(m.nombre_plato);
    byDish.set(key, [...(byDish.get(key) ?? []), cleanLabel(m.nombre_plato)]);
  }
  const topDishes = [...byDish.values()]
    .map((labels) => ({ label: mostCommonLabel(labels), count: labels.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"))
    .slice(0, G3_TOP_DISHES)
    .map((d) => ({ label: d.label, rate: d.count / monthMenus.length }));
  const leastVaried =
    [...dishCounts].sort((a, b) => a.dishes - b.dishes || a.nombre.localeCompare(b.nombre, "es"))[0] ?? null;
  const counts = dishCounts.map((d) => d.dishes);

  return {
    groupName: input.groupName,
    month,
    coverage: { withData: active.length, total: kitchenRows.length },
    prepared,
    cost: {
      perServing,
      min: kitchenCosts.length ? Math.min(...kitchenCosts.map((k) => k.cost)) : 0,
      max: kitchenCosts.length ? Math.max(...kitchenCosts.map((k) => k.cost)) : 0,
    },
    merma: expectedCost > 0 ? excessCost / expectedCost : null,
    unserved: {
      servings: unservedServings,
      rate: prepared > 0 ? unservedServings / prepared : 0,
      cost: unservedServings * perServing,
    },
    dishes: {
      average: counts.length ? Math.round((counts.reduce((s, n) => s + n, 0) / counts.length) * 10) / 10 : 0,
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
    },
    yields,
    kitchenCosts: kitchenCosts.map(({ total: _t, ...k }) => k),
    variety: {
      proteinRate: monthMenus.length
        ? monthMenus.filter((m) => isAnimalProtein(m.nombre_plato)).length / monthMenus.length
        : 0,
      leastVaried,
      repeatedKitchens,
      topDishes,
    },
  };
}
