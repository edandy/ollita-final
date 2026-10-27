import { formatG1Number, isPadronChannel, personKey, weekRangeMonSat } from "./g1";
import { stockAtCutoff } from "./g2";
import { monthRange } from "./g3";
import { G4_CATEGORIES, g4CategoryOf } from "./g4";

export const G7_ORIGINS = [
  { key: "municipalidad", label: "Municipalidad (PCA)" },
  { key: "comprado", label: "Compras de los comedores" },
  { key: "donado", label: "Donaciones" },
] as const;

export const G7_DEPENDENCY = [
  { label: "1 a 5 días", min: 1, max: 5 },
  { label: "6 a 10 días", min: 6, max: 10 },
  { label: "11 a 19 días", min: 11, max: 19 },
  { label: "20 días o más", min: 20, max: Infinity },
] as const;

/** Supplies weighed for "De dónde vienen los alimentos"; a litre counts as a kilo, units are left out. */
const WEIGHED_UNITS = new Set(["kg", "L"]);

export type G7Kitchen = { id: string; nombre: string };
export type G7Menu = { id: string; comedor_id: string; fecha: string };
/** A `recogida` reservation. */
export type G7Pickup = {
  menu_id: string;
  comedor_id: string;
  cantidad: number;
  codigo: string;
  dni: string | null;
  beneficiario_id: string | null;
};
export type G7Person = {
  id: string;
  comedor_id: string;
  dni: string;
  care_group: string | null;
  carga_familiar: number;
};
export type G7Supply = { id: string; comedor_id: string; unidad: string; origen: string; stock_actual: number };
export type G7Movement = {
  insumo_id: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  donation_id?: string | null;
};
export type G7Team = { hours: number; sociasEnTurnos: number; womenRate: number | null };

/** People are shown rounded, and fewer than 5 never as an exact number. */
export function formatG7People(n: number) {
  if (n <= 0) return "0";
  if (n < 5) return "<5";
  const step = n < 100 ? 5 : n < 1000 ? 10 : 100;
  return `~${formatG1Number(Math.round(n / step) * step)}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday–Saturday weeks of the month, cut to [from, to]. */
export function g7Weeks(from: string, to: string) {
  const weeks: { from: string; to: string; label: string; partial: boolean }[] = [];
  for (let start = weekRangeMonSat(from).from; start <= to; start = addDays(start, 7)) {
    const week = weekRangeMonSat(start);
    const a = week.from < from ? from : week.from;
    const b = week.to > to ? to : week.to;
    if (a > b) continue;
    const label = a === b ? String(Number(a.slice(8))) : `${Number(a.slice(8))} al ${Number(b.slice(8))}`;
    weeks.push({ from: a, to: b, label, partial: a !== week.from || b !== week.to });
  }
  return weeks;
}

export function buildG7Report(input: {
  groupName: string;
  allyName: string | null;
  monthStart: string;
  today: string;
  kitchens: G7Kitchen[];
  menus: G7Menu[];
  pickups: G7Pickup[];
  people: G7Person[];
  supplies: G7Supply[];
  movements: G7Movement[];
  team: G7Team;
}) {
  const range = monthRange(input.monthStart);
  const until = input.today >= range.from && input.today < range.to ? input.today : null;
  const month = { ...range, until };
  const end = until ?? range.to;
  const inMonth = (fecha: string) => fecha >= range.from && fecha <= end;

  const menuDate = new Map(input.menus.filter((m) => inMonth(m.fecha)).map((m) => [m.id, m.fecha]));
  const pickups = input.pickups
    .filter((p) => menuDate.has(p.menu_id))
    .map((p) => ({ ...p, fecha: menuDate.get(p.menu_id)! }));
  const servings = pickups.reduce((s, p) => s + p.cantidad, 0);

  // Padrón people are matched by DNI across kitchens, so someone in two padrones counts once.
  const personById = new Map(input.people.map((p) => [p.id, p]));
  const personByDni = new Map(input.people.map((p) => [`${p.comedor_id}|${p.dni.trim()}`, p]));
  const padronPerson = (p: G7Pickup) => {
    if (p.beneficiario_id) return personById.get(p.beneficiario_id) ?? null;
    if (p.dni && isPadronChannel(p)) return personByDni.get(`${p.comedor_id}|${p.dni.trim()}`) ?? null;
    return null;
  };

  const people = new Set<string>();
  const padron = new Map<string, { load: number; careGroup: string | null; days: Set<string> }>();
  for (const p of pickups) {
    const person = padronPerson(p);
    const key = person ? person.dni.trim() : personKey(p);
    if (!key) continue;
    people.add(key);
    if (!person) continue;
    const cur = padron.get(key) ?? { load: 0, careGroup: null, days: new Set<string>() };
    cur.load = Math.max(cur.load, Number(person.carga_familiar) || 0);
    cur.careGroup ??= person.care_group;
    cur.days.add(p.fecha);
    padron.set(key, cur);
  }
  const padronPeople = [...padron.values()];
  const totalLoad = padronPeople.reduce((s, p) => s + p.load, 0);

  const weekRows = g7Weeks(range.from, end).map((w) => ({
    label: w.label,
    partial: w.partial,
    servings: pickups.filter((p) => p.fecha >= w.from && p.fecha <= w.to).reduce((s, p) => s + p.cantidad, 0),
  }));

  const classified = padronPeople.filter((p) => g4CategoryOf(p.careGroup) !== "unclassified");
  const categories = G4_CATEGORIES.map(({ key, label }) => {
    const n = classified.filter((p) => g4CategoryOf(p.careGroup) === key).length;
    return { key, label, people: n, share: classified.length ? n / classified.length : 0 };
  });
  const padronServings = pickups.filter((p) => isPadronChannel(p)).reduce((s, p) => s + p.cantidad, 0);

  const dependency = G7_DEPENDENCY.map((b) => {
    const n = padronPeople.filter((p) => p.days.size >= b.min && p.days.size <= b.max).length;
    return { label: b.label, people: n, share: padronPeople.length ? n / padronPeople.length : 0 };
  });

  const supplyById = new Map(input.supplies.map((s) => [s.id, s]));
  const movesBySupply = new Map<string, G7Movement[]>();
  for (const m of input.movements) movesBySupply.set(m.insumo_id, [...(movesBySupply.get(m.insumo_id) ?? []), m]);
  const kilosBy = new Map<string, number>();
  for (const m of input.movements) {
    const s = supplyById.get(m.insumo_id);
    if (!s || m.tipo !== "ingreso" || !inMonth(m.fecha) || !WEIGHED_UNITS.has(s.unidad)) continue;
    // A kitchen may record a donation lot (G8) into a supply it usually buys.
    const origin = m.donation_id ? "donado" : s.origen;
    kilosBy.set(origin, (kilosBy.get(origin) ?? 0) + (Number(m.cantidad) || 0));
  }
  const kilos = [...kilosBy.values()].reduce((s, n) => s + n, 0);
  const origins = G7_ORIGINS.map(({ key, label }) => ({
    key,
    label,
    kilos: kilosBy.get(key) ?? 0,
    share: kilos ? (kilosBy.get(key) ?? 0) / kilos : 0,
  }));

  // Brecha: the day each kitchen's municipal stock hit zero after its delivery of the month.
  const runOuts: { kitchenId: string; date: string }[] = [];
  for (const k of input.kitchens) {
    const municipal = input.supplies.filter(
      (s) => s.comedor_id === k.id && s.origen === "municipalidad" && WEIGHED_UNITS.has(s.unidad),
    );
    const deliveries = municipal.flatMap((s) =>
      (movesBySupply.get(s.id) ?? []).filter((m) => m.tipo === "ingreso" && inMonth(m.fecha)).map((m) => m.fecha),
    );
    if (deliveries.length === 0) continue;
    const firstDelivery = deliveries.sort()[0]!;
    for (let d = firstDelivery; d <= end; d = addDays(d, 1)) {
      const stock = municipal.reduce(
        (sum, s) => sum + stockAtCutoff(s.stock_actual, d, movesBySupply.get(s.id) ?? []),
        0,
      );
      if (stock <= 1e-6) {
        runOuts.push({ kitchenId: k.id, date: d });
        break;
      }
    }
  }
  const servingsAfter = runOuts.reduce(
    (sum, r) =>
      sum +
      pickups.filter((p) => p.comedor_id === r.kitchenId && p.fecha > r.date).reduce((s, p) => s + p.cantidad, 0),
    0,
  );

  const withData = new Set(input.menus.filter((m) => inMonth(m.fecha)).map((m) => m.comedor_id));

  return {
    groupName: input.groupName,
    allyName: input.allyName,
    month,
    coverage: { withData: input.kitchens.filter((k) => withData.has(k.id)).length, total: input.kitchens.length },
    servings,
    people: people.size,
    reached: people.size + totalLoad,
    averageLoad: padronPeople.length ? totalLoad / padronPeople.length : 0,
    weeks: weekRows.map(({ label, servings: n }) => ({ label, servings: n })),
    partialWeeks: weekRows.some((w) => w.partial),
    categories,
    padronShare: servings ? padronServings / servings : 0,
    dependency,
    frequentShare: dependency.at(-1)!.share,
    origins,
    kilos,
    gap: runOuts.length
      ? {
          averageDay: Math.round(runOuts.reduce((s, r) => s + Number(r.date.slice(8)), 0) / runOuts.length),
          kitchens: runOuts.length,
          servingsAfterShare: servings ? servingsAfter / servings : 0,
        }
      : null,
    team: input.team,
  };
}

export type G7Report = ReturnType<typeof buildG7Report>;
