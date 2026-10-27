import { dailyUsage, stockAtCutoff, supplyKey, type G2Movement } from "./g2";
import { monthRange } from "./g3";
import { serviceDates } from "./g5";

/** Purchases of the last days that set what a kitchen pays. */
export const G11_PRICE_WINDOW_DAYS = 90;
/** Paying this much more than the group is shown in red. */
export const G11_HIGH_DIFF = 0.05;

export type G11Kitchen = { id: string; nombre: string; dias_atencion: string[] | null };
export type G11Supply = {
  id: string;
  comedor_id: string;
  nombre: string;
  unidad: string;
  stock_actual: number;
  precio_referencial: number | null;
  origen: string;
};
export type G11Movement = Pick<G2Movement, "insumo_id" | "tipo" | "cantidad" | "fecha" | "precio_unitario" | "transfer_id"> & {
  donation_id: string | null;
};

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weighted(parts: { value: number; weight: number }[]) {
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  return weight > 0 ? parts.reduce((s, p) => s + p.value * p.weight, 0) / weight : null;
}

type Row = { kitchenId: string; nombre: string; key: string; label: string; unit: string; need: number; price: number | null };

export function buildG11Report(input: {
  groupName: string;
  monthStart: string;
  today: string;
  kitchens: G11Kitchen[];
  supplies: G11Supply[];
  movements: G11Movement[];
  /** Kitchens marked in the saved purchase; `null` before it is saved. */
  participantIds: string[] | null;
  /** Negotiated price per supply key. */
  negotiated: Record<string, number>;
}) {
  const month = monthRange(input.monthStart);
  const dayBefore = addDays(month.from, -1);
  const cutoff = input.today < dayBefore ? input.today : dayBefore;
  const priceFrom = addDays(cutoff, -(G11_PRICE_WINDOW_DAYS - 1));
  const kitchenById = new Map(input.kitchens.map((k) => [k.id, k]));
  const movesBySupply = new Map<string, G11Movement[]>();
  for (const m of input.movements) movesBySupply.set(m.insumo_id, [...(movesBySupply.get(m.insumo_id) ?? []), m]);

  // What each kitchen pays: its purchases of the last 90 days, else its reference price.
  const paidPrice = (s: G11Supply) => {
    const purchases = (movesBySupply.get(s.id) ?? []).filter(
      (m) =>
        m.tipo === "ingreso" &&
        m.precio_unitario != null &&
        !m.transfer_id &&
        !m.donation_id &&
        m.fecha >= priceFrom &&
        m.fecha <= cutoff,
    );
    return (
      weighted(purchases.map((m) => ({ value: Number(m.precio_unitario), weight: Number(m.cantidad) || 0 }))) ??
      (s.precio_referencial == null ? null : Number(s.precio_referencial))
    );
  };

  const rows: Row[] = [];
  for (const s of input.supplies) {
    const k = kitchenById.get(s.comedor_id);
    if (!k || s.origen !== "comprado") continue;
    const moves = movesBySupply.get(s.id) ?? [];
    const usage = dailyUsage(cutoff, moves);
    if (usage <= 0) continue;
    const days = serviceDates(k.dias_atencion, month.from, month.to).length;
    rows.push({
      kitchenId: k.id,
      nombre: k.nombre.replace(/^Demo · /, ""),
      key: supplyKey(s.nombre, s.unidad),
      label: s.nombre.trim(),
      unit: s.unidad,
      need: Math.max(0, usage * days - stockAtCutoff(s.stock_actual, cutoff, moves)),
      price: paidPrice(s),
    });
  }

  const withData = new Set(rows.map((r) => r.kitchenId));
  const participants = new Set(
    input.participantIds == null ? withData : input.participantIds.filter((id) => kitchenById.has(id)),
  );
  const taking = rows.filter((r) => participants.has(r.kitchenId));

  const keys = [...new Set(rows.map((r) => r.key))];
  const items = keys
    .map((key) => {
      const own = taking.filter((r) => r.key === key);
      const all = rows.filter((r) => r.key === key);
      const need = own.reduce((s, r) => s + r.need, 0);
      const quantity = Math.ceil(need / 10) * 10;
      const currentPrice = weighted(
        own.filter((r) => r.price != null && r.need > 0).map((r) => ({ value: r.price!, weight: r.need })),
      );
      const negotiated = input.negotiated[key] ?? null;
      return {
        key,
        label: all[0]!.label,
        unit: all[0]!.unit,
        quantity,
        currentPrice,
        negotiated,
        savings:
          negotiated != null && currentPrice != null ? Math.max(0, currentPrice - negotiated) * quantity : null,
      };
    })
    .filter((i) => i.quantity > 0)
    .sort(
      (a, b) =>
        b.quantity * (b.currentPrice ?? 0) - a.quantity * (a.currentPrice ?? 0) || a.label.localeCompare(b.label, "es"),
    );

  const negotiatedItems = items.filter((i) => i.savings != null);
  const savingsTotal = negotiatedItems.reduce((s, i) => s + i.savings!, 0);
  const negotiatedSpend = negotiatedItems.reduce((s, i) => s + i.quantity * i.currentPrice!, 0);

  const main = items.find((i) => i.currentPrice != null) ?? null;
  const priced = main ? rows.filter((r) => r.key === main.key && r.price != null) : [];
  const diffs = priced.map((r) => ({ ...r, diff: r.price! / main!.currentPrice! - 1 }));
  const maxDiff = Math.max(0, ...diffs.map((d) => Math.abs(d.diff)));

  return {
    groupName: input.groupName,
    month,
    cutoff,
    participants: { count: participants.size, total: input.kitchens.length },
    coverage: { withData: withData.size, total: input.kitchens.length },
    items,
    units: {
      kg: items.filter((i) => i.unit === "kg").reduce((s, i) => s + i.quantity, 0),
      L: items.filter((i) => i.unit === "L").reduce((s, i) => s + i.quantity, 0),
      unid: items.filter((i) => i.unit === "unid").reduce((s, i) => s + i.quantity, 0),
    },
    savings: { total: savingsTotal, share: negotiatedSpend ? savingsTotal / negotiatedSpend : 0 },
    main: main ? { key: main.key, label: main.label, unit: main.unit, groupPrice: main.currentPrice!, negotiated: main.negotiated } : null,
    above: { count: diffs.filter((d) => d.diff > 1e-9).length, total: diffs.length },
    chart: diffs
      .sort((a, b) => b.price! - a.price! || a.nombre.localeCompare(b.nombre, "es"))
      .map((d) => ({
        id: d.kitchenId,
        nombre: d.nombre,
        price: d.price!,
        diff: d.diff,
        width: maxDiff ? Math.abs(d.diff) / maxDiff : 0,
        high: d.diff >= G11_HIGH_DIFF,
      })),
  };
}

export type G11Report = ReturnType<typeof buildG11Report>;
