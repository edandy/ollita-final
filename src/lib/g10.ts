import { shiftWeek, weekRangeMonSat } from "./g1";
import {
  G2_ALERT_DAYS,
  coverageDays,
  dailyUsage,
  g2Cutoff,
  g2CutoffLabel,
  stockAtCutoff,
  supplyKey,
  type G2Movement,
} from "./g2";

/** Fewer days of stock than this is a shortage, the same alert as G2. */
export const G10_SHORT_DAYS = G2_ALERT_DAYS;
/** More days than this is extra a kitchen can lend; lenders keep this much. */
export const G10_SURPLUS_DAYS = 8;
/** Loans lift a short kitchen up to this many days. */
export const G10_TARGET_DAYS = 6;
const MAX_WARNINGS = 2;

export type G10Kitchen = { id: string; nombre: string; raciones_diarias: number };
export type G10Supply = { id: string; comedor_id: string; nombre: string; unidad: string; stock_actual: number };
export type G10Movement = Pick<G2Movement, "insumo_id" | "tipo" | "cantidad" | "fecha" | "transfer_id">;
export type G10Transfer = {
  from_comedor_id: string;
  to_comedor_id: string;
  supply_name: string;
  unit: string;
  quantity: number;
  sent_on: string;
  status: string;
};

/** Loans go in round amounts: down to 5 from 10 up, down to whole units below. */
export function roundLoan(quantity: number) {
  if (quantity >= 10) return Math.floor(quantity / 5) * 5;
  return Math.floor(quantity);
}

function shortName(nombre: string) {
  return nombre.replace(/^Demo · /, "");
}

type Entry = { kitchenId: string; nombre: string; stock: number; usage: number; days: number };

export function buildG10Report(input: {
  groupName: string;
  weekStart: string;
  today: string;
  kitchens: G10Kitchen[];
  supplies: G10Supply[];
  movements: G10Movement[];
  transfers: G10Transfer[];
}) {
  const range = weekRangeMonSat(input.weekStart);
  const cutoff = g2Cutoff(range.to, input.today);
  const kitchenById = new Map(input.kitchens.map((k) => [k.id, k]));
  const nameOf = (id: string) => shortName(kitchenById.get(id)?.nombre ?? "Olla");

  const movesBySupply = new Map<string, G10Movement[]>();
  for (const m of input.movements) movesBySupply.set(m.insumo_id, [...(movesBySupply.get(m.insumo_id) ?? []), m]);

  // Per supply key, each kitchen that uses it, with its coverage at the cutoff.
  const byKey = new Map<string, { label: string; unit: string; entries: Entry[] }>();
  const withData = new Set<string>();
  for (const s of input.supplies) {
    if (!kitchenById.has(s.comedor_id)) continue;
    const moves = movesBySupply.get(s.id) ?? [];
    const usage = dailyUsage(cutoff, moves);
    if (usage <= 0) continue;
    withData.add(s.comedor_id);
    const stock = stockAtCutoff(s.stock_actual, cutoff, moves);
    const key = supplyKey(s.nombre, s.unidad);
    const group = byKey.get(key) ?? { label: s.nombre.trim(), unit: s.unidad, entries: [] };
    group.entries.push({ kitchenId: s.comedor_id, nombre: nameOf(s.comedor_id), stock, usage, days: coverageDays(stock, usage)! });
    byKey.set(key, group);
  }

  const comparable = [...byKey.entries()]
    .filter(([, g]) => new Set(g.entries.map((e) => e.kitchenId)).size >= 2)
    .map(([key, g]) => ({
      key,
      ...g,
      short: g.entries.filter((e) => e.days < G10_SHORT_DAYS).sort((a, b) => a.days - b.days || a.nombre.localeCompare(b.nombre, "es")),
      surplus: g.entries
        .filter((e) => e.days > G10_SURPLUS_DAYS)
        .sort((a, b) => b.days - a.days || a.nombre.localeCompare(b.nombre, "es")),
    }))
    .sort(
      (a, b) =>
        b.entries.length - a.entries.length || b.short.length - a.short.length || a.label.localeCompare(b.label, "es"),
    );

  const suggestions: {
    key: string;
    label: string;
    unit: string;
    fromId: string;
    from: string;
    toId: string;
    to: string;
    quantity: number;
    daysBefore: number;
    daysAfter: number;
  }[] = [];
  const warnings: { label: string; groupDays: number; servings: number; uncovered: string[] }[] = [];
  let covered = 0;
  let shortages = 0;

  for (const g of comparable) {
    if (g.short.length === 0) continue;
    const spare = new Map(g.surplus.map((e) => [e.kitchenId, e.stock - G10_SURPLUS_DAYS * e.usage]));
    const uncovered: string[] = [];
    // The most urgent kitchen first, from the lender with the most to spare.
    for (const s of g.short) {
      shortages += 1;
      let stock = s.stock;
      let need = G10_TARGET_DAYS * s.usage - stock;
      // Each lender lends at most once to each kitchen, so rounding leftovers never become extra loans.
      const lenders = g.surplus
        .filter((e) => (spare.get(e.kitchenId) ?? 0) > 0)
        .sort((a, b) => spare.get(b.kitchenId)! - spare.get(a.kitchenId)!);
      for (const lender of lenders) {
        if (need <= 0) break;
        const give = roundLoan(Math.min(need, spare.get(lender.kitchenId)!));
        if (give <= 0) continue;
        const before = coverageDays(stock, s.usage)!;
        stock += give;
        need -= give;
        spare.set(lender.kitchenId, spare.get(lender.kitchenId)! - give);
        suggestions.push({
          key: g.key,
          label: g.label,
          unit: g.unit,
          fromId: lender.kitchenId,
          from: lender.nombre,
          toId: s.kitchenId,
          to: s.nombre,
          quantity: give,
          daysBefore: before,
          daysAfter: coverageDays(stock, s.usage)!,
        });
      }
      if (coverageDays(stock, s.usage)! >= G10_SHORT_DAYS) covered += 1;
      else uncovered.push(s.nombre);
    }
    if (uncovered.length > 0 && warnings.length < MAX_WARNINGS) {
      const stock = g.entries.reduce((sum, e) => sum + e.stock, 0);
      const usage = g.entries.reduce((sum, e) => sum + e.usage, 0);
      const groupDays = coverageDays(stock, usage) ?? 0;
      const daily = g.entries.reduce((sum, e) => sum + (Number(kitchenById.get(e.kitchenId)?.raciones_diarias) || 0), 0);
      warnings.push({ label: g.label, groupDays, servings: Math.round((groupDays * daily) / 100) * 100, uncovered });
    }
  }

  const previousWeek = weekRangeMonSat(shiftWeek(range.from, -1));
  const visible = (id: string) => kitchenById.has(id);
  const previous = input.transfers
    .filter(
      (t) =>
        t.sent_on >= previousWeek.from &&
        t.sent_on <= previousWeek.to &&
        (visible(t.from_comedor_id) || visible(t.to_comedor_id)),
    )
    .sort((a, b) => a.sent_on.localeCompare(b.sent_on))
    .map((t) => ({
      date: t.sent_on,
      label: t.supply_name.trim(),
      from: nameOf(t.from_comedor_id),
      to: nameOf(t.to_comedor_id),
      quantity: Number(t.quantity) || 0,
      unit: t.unit,
      received: t.status === "received",
    }));

  const rows = comparable.filter((g) => g.short.length > 0);
  const kitchensIn = (list: Entry[][]) => new Set(list.flat().map((e) => e.kitchenId)).size;

  return {
    groupName: input.groupName,
    week: range,
    cutoff: { date: cutoff, label: g2CutoffLabel(cutoff) },
    thresholds: { short: G10_SHORT_DAYS, surplus: G10_SURPLUS_DAYS },
    coverage: { withData: withData.size, total: input.kitchens.length },
    rows: rows.map((g) => ({
      key: g.key,
      label: g.label,
      short: g.short.map(({ kitchenId, nombre, days }) => ({ id: kitchenId, nombre, days })),
      surplus: g.surplus.map(({ kitchenId, nombre, days }) => ({ id: kitchenId, nombre, days })),
    })),
    suggestions,
    counts: {
      shortKitchens: kitchensIn(rows.map((g) => g.short)),
      shortSupplies: rows.length,
      // Extra of a supply nobody is short of cannot help anyone.
      surplusKitchens: kitchensIn(rows.map((g) => g.surplus)),
      suggested: suggestions.length,
      covered,
      shortages,
    },
    warnings,
    previous,
    previousReceived: previous.filter((t) => t.received).length,
  };
}

export type G10Report = ReturnType<typeof buildG10Report>;
