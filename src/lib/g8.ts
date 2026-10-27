import { formatG1Number, personKey } from "./g1";
import { supplyKey } from "./g2";
import { dishKey } from "./g3";

export type G8Version = "donor" | "supervision";

export type G8Kitchen = { id: string; nombre: string; foto_url: string | null };
export type G8Supply = { id: string; comedor_id: string; nombre: string; unidad: string };
export type G8Movement = {
  insumo_id: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  donation_id: string | null;
  transfer_id?: string | null;
};
export type G8Menu = { id: string; comedor_id: string; fecha: string; nombre_plato: string; foto_url: string | null };
/** A `recogida` reservation. */
export type G8Pickup = {
  menu_id: string;
  comedor_id: string;
  cantidad: number;
  dni: string | null;
  beneficiario_id: string | null;
};

/** A week of service runs Monday to Saturday. */
const SERVICE_DAYS_PER_WEEK = 6;
const MAX_PRODUCT_COLUMNS = 3;
const MAX_DISHES = 5;
const NUMBER_WORDS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];

function numberWord(n: number) {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "dos a tres semanas", or days when the share lasted a week or less. */
export function g8DurationText(minDays: number, maxDays: number) {
  if (maxDays <= SERVICE_DAYS_PER_WEEK) {
    if (minDays === maxDays) return `${maxDays} ${maxDays === 1 ? "día" : "días"}`;
    return `${minDays} a ${maxDays} días`;
  }
  const from = Math.ceil(minDays / SERVICE_DAYS_PER_WEEK);
  const to = Math.ceil(maxDays / SERVICE_DAYS_PER_WEEK);
  if (from === to) return `${numberWord(to)} ${to === 1 ? "semana" : "semanas"}`;
  return `${numberWord(from)} a ${numberWord(to)} semanas`;
}

function letter(i: number) {
  return `Comedor ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
}

type Part = {
  kitchenId: string;
  key: string;
  label: string;
  unit: string;
  quantity: number;
  start: string;
  end: string;
  used: number;
  days: number;
  servings: number;
};

export function buildG8Report(input: {
  donation: { id: string; code: string; receivedOn: string };
  donorName: string;
  groupName: string;
  groupKitchenCount: number;
  version: G8Version;
  today: string;
  kitchens: G8Kitchen[];
  supplies: G8Supply[];
  movements: G8Movement[];
  menus: G8Menu[];
  pickups: G8Pickup[];
}) {
  const supplyById = new Map(input.supplies.map((s) => [s.id, s]));
  const keyOf = (s: G8Supply) => `${s.comedor_id}|${supplyKey(s.nombre, s.unidad)}`;

  // Shares: the lot's entries per kitchen and product.
  const shares = new Map<string, { supply: G8Supply; quantity: number; start: string; insumoIds: Set<string> }>();
  for (const m of input.movements) {
    const s = supplyById.get(m.insumo_id);
    if (!s || m.tipo !== "ingreso" || m.donation_id !== input.donation.id) continue;
    const cur = shares.get(keyOf(s)) ?? { supply: s, quantity: 0, start: m.fecha, insumoIds: new Set<string>() };
    cur.quantity += Number(m.cantidad) || 0;
    if (m.fecha < cur.start) cur.start = m.fecha;
    cur.insumoIds.add(s.id);
    shares.set(keyOf(s), cur);
  }

  const menuById = new Map(input.menus.map((m) => [m.id, m]));
  const servedBetween = (kitchenId: string, from: string, to: string) =>
    input.pickups.reduce((sum, p) => {
      const fecha = menuById.get(p.menu_id)?.fecha;
      return p.comedor_id === kitchenId && fecha && fecha >= from && fecha <= to ? sum + p.cantidad : sum;
    }, 0);

  // Each share is used first: it lasts until the product's outflows since it arrived cover it.
  const parts: Part[] = [...shares.values()].map((share) => {
    const byDay = new Map<string, number>();
    for (const m of input.movements) {
      if (m.tipo !== "salida" || m.transfer_id || !share.insumoIds.has(m.insumo_id) || m.fecha < share.start) continue;
      byDay.set(m.fecha, (byDay.get(m.fecha) ?? 0) + (Number(m.cantidad) || 0));
    }
    const dates = [...byDay.keys()].sort();
    let used = 0;
    let end = share.start;
    let days = 0;
    for (const d of dates) {
      used += byDay.get(d)!;
      end = d;
      days += 1;
      if (used >= share.quantity - 1e-9) break;
    }
    const kitchenId = share.supply.comedor_id;
    const servings = servedBetween(kitchenId, share.start, end);
    return {
      kitchenId,
      key: supplyKey(share.supply.nombre, share.supply.unidad),
      label: share.supply.nombre.trim(),
      unit: share.supply.unidad,
      quantity: share.quantity,
      start: share.start,
      end,
      used: Math.min(used, share.quantity),
      days,
      // Kilos of the share ÷ the kitchen's own kilos per serving while it lasted.
      servings: used > 0 ? (share.quantity * servings) / used : 0,
    };
  });

  const productMap = new Map<string, { key: string; label: string; unit: string; quantity: number; servings: number }>();
  for (const p of parts) {
    const cur = productMap.get(p.key) ?? { key: p.key, label: p.label, unit: p.unit, quantity: 0, servings: 0 };
    cur.quantity += p.quantity;
    cur.servings += p.servings;
    productMap.set(p.key, cur);
  }
  const sortedProducts = [...productMap.values()].sort((a, b) => b.servings - a.servings || b.quantity - a.quantity);
  const mainKey = sortedProducts[0]?.key ?? null;
  const products = sortedProducts.map((p) => ({
    ...p,
    main: p.key === mainKey,
    perServing: p.servings > 0 ? (p.quantity * 1000) / p.servings : 0,
  }));
  const columns = products.slice(0, MAX_PRODUCT_COLUMNS);

  const kitchenById = new Map(input.kitchens.map((k) => [k.id, k]));
  const mainQty = (kitchenId: string) =>
    parts.filter((p) => p.kitchenId === kitchenId && p.key === mainKey).reduce((s, p) => s + p.quantity, 0);
  const kitchenIds = [...new Set(parts.map((p) => p.kitchenId))].sort(
    (a, b) =>
      mainQty(b) - mainQty(a) ||
      (kitchenById.get(a)?.nombre ?? "").localeCompare(kitchenById.get(b)?.nombre ?? "", "es"),
  );
  const kitchens = kitchenIds.map((id, i) => {
    const own = parts.filter((p) => p.kitchenId === id);
    const main = own.find((p) => p.key === mainKey);
    return {
      id,
      label: input.version === "donor" ? letter(i) : (kitchenById.get(id)?.nombre ?? "Olla"),
      quantities: columns.map((c) => own.filter((p) => p.key === c.key).reduce((s, p) => s + p.quantity, 0)),
      servings: main ? main.servings : Math.max(0, ...own.map((p) => p.servings)),
      days: Math.max(0, ...own.map((p) => p.days)),
      start: own.reduce((m, p) => (p.start < m ? p.start : m), own[0]!.start),
      end: own.reduce((m, p) => (p.end > m ? p.end : m), own[0]!.end),
    };
  });

  const quantity = parts.reduce((s, p) => s + p.quantity, 0);
  const used = parts.reduce((s, p) => s + p.used, 0);
  const done = parts.length > 0 && parts.every((p) => p.used >= p.quantity - 1e-9);
  const consumed = done ? 1 : quantity ? used / quantity : 0;
  const daysList = kitchens.map((k) => k.days);
  const daysRange = daysList.length ? { min: Math.min(...daysList), max: Math.max(...daysList) } : null;

  const inWindow = (kitchenId: string, fecha: string) => {
    const k = kitchens.find((x) => x.id === kitchenId);
    return !!k && fecha >= k.start && fecha <= k.end;
  };
  const people = new Set<string>();
  for (const p of input.pickups) {
    const fecha = menuById.get(p.menu_id)?.fecha;
    const key = personKey(p);
    if (key && fecha && inWindow(p.comedor_id, fecha)) people.add(key);
  }

  const windowMenus = input.menus.filter((m) => inWindow(m.comedor_id, m.fecha));
  const dishCounts = new Map<string, { name: string; count: number; first: number }>();
  windowMenus.forEach((m, i) => {
    const key = dishKey(m.nombre_plato);
    const cur = dishCounts.get(key) ?? { name: m.nombre_plato.trim(), count: 0, first: i };
    cur.count += 1;
    dishCounts.set(key, cur);
  });
  const topDishes = [...dishCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, MAX_DISHES);
  const topKeys = new Set(topDishes.map(([key]) => key));
  const dishPhoto = windowMenus.find((m) => m.foto_url && topKeys.has(dishKey(m.nombre_plato)))?.foto_url ?? null;
  const kitchenPhoto = kitchenIds.map((id) => kitchenById.get(id)?.foto_url).find(Boolean) ?? null;

  const mainServings = products[0]?.servings ?? 0;
  const spread = `se repartió entre ${kitchens.length} de sus ${input.groupKitchenCount} comedores`;
  const lead = !daysRange
    ? `Gracias por sumar. Su donación al grupo ${input.groupName} todavía no tiene entregas registradas por los comedores.`
    : done
      ? `Gracias por sumar. Su donación al grupo ${input.groupName} ${spread} y se convirtió en almuerzos durante ${g8DurationText(daysRange.min, daysRange.max)}.`
      : `Gracias por sumar. Su donación al grupo ${input.groupName} ${spread} y ya se usó el ${Math.round(consumed * 100)}%.`;

  return {
    version: input.version,
    donation: input.donation,
    donorName: input.donorName,
    groupName: input.groupName,
    status: { done, consumed },
    lead,
    coverage: { kitchens: kitchens.length, total: input.groupKitchenCount },
    servingsKpi: `≈ ${formatG1Number(Math.round(mainServings / 100) * 100)}`,
    people: people.size,
    daysRange,
    products,
    columns: columns.map(({ key, label, unit }) => ({ key, label, unit })),
    kitchens: kitchens.map(({ id, label, quantities, servings, days }) => ({ id, label, quantities, servings, days })),
    dishes: topDishes.map(([, d]) => d.name),
    photos: { dish: dishPhoto, kitchen: kitchenPhoto },
  };
}

export type G8Report = ReturnType<typeof buildG8Report>;
