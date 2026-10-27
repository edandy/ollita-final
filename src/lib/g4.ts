import { todayISO } from "./dates";
import { formatG1Number } from "./g1";
import { monthRange } from "./g3";
import { ageOn } from "./padron";

/** Counts from 1 up to this value minus one are hidden so nobody can be singled out. */
export const G4_SMALL_COUNT = 5;
/** Kitchens with a smaller share of phones in their padrón are flagged. */
export const G4_PHONE_ALERT = 0.5;

export type G4Mode = "month" | "year";

export type G4Beneficiary = {
  id: string;
  comedor_id: string;
  dni: string;
  activo: boolean;
  care_group: string | null;
  birth_date: string | null;
  carga_familiar: number;
  telefono: string | null;
  direccion: string | null;
  foto_url: string | null;
  created_at: string;
};

/** A `recogida` reservation inside the period. */
export type G4Pickup = { comedor_id: string; dni: string | null; beneficiario_id: string | null };

export function yearRange(iso: string) {
  const y = iso.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: y };
}

export function shiftYear(iso: string, years: number) {
  return `${Number(iso.slice(0, 4)) + years}-01-01`;
}

export function g4Period(mode: G4Mode, start: string, today: string) {
  const range = mode === "year" ? yearRange(start) : monthRange(start);
  const until = today >= range.from && today < range.to ? today : null;
  return { mode, from: range.from, to: range.to, label: range.label, until };
}

export type G4Period = ReturnType<typeof g4Period>;

export function formatG4Count(n: number) {
  return n > 0 && n < G4_SMALL_COUNT ? "<5" : formatG1Number(n);
}

type CategoryKey = "older_adult" | "child" | "social_case" | "disability" | "mothers" | "unclassified";

const CATEGORY_ORDER: { key: Exclude<CategoryKey, "unclassified">; label: string }[] = [
  { key: "older_adult", label: "Adultos mayores" },
  { key: "child", label: "Niñas y niños" },
  { key: "social_case", label: "Casos sociales" },
  { key: "disability", label: "Personas con discapacidad" },
  { key: "mothers", label: "Gestantes y lactantes" },
];

type Part = { label: string; count: number };

export type G4Category = { key: CategoryKey; label: string; people: number; parts: Part[] | null };

type Person = {
  careGroup: string | null;
  birthDate: string | null;
  load: number;
  phone: boolean;
  address: boolean;
  photo: boolean;
  kitchens: Set<string>;
};

function filled(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function categoryOf(careGroup: string | null): CategoryKey {
  if (careGroup === "pregnant" || careGroup === "lactating") return "mothers";
  if (careGroup === "older_adult" || careGroup === "child" || careGroup === "social_case" || careGroup === "disability") {
    return careGroup;
  }
  return "unclassified";
}

function ageParts(people: Person[], asOf: string, bands: { label: string; min: number; max: number }[]): Part[] {
  const parts = bands.map((b) => ({ label: b.label, count: 0 }));
  let other = 0;
  for (const p of people) {
    const age = p.birthDate ? ageOn(p.birthDate, asOf) : null;
    const i = age == null ? -1 : bands.findIndex((b) => age >= b.min && age <= b.max);
    if (i >= 0) parts[i]!.count += 1;
    else other += 1;
  }
  return other > 0 ? [...parts, { label: "otras edades", count: other }] : parts;
}

function partsFor(key: CategoryKey, people: Person[], asOf: string): Part[] | null {
  if (key === "older_adult") {
    return ageParts(people, asOf, [
      { label: "60 a 74 años", min: 60, max: 74 },
      { label: "75 o más", min: 75, max: Infinity },
    ]);
  }
  if (key === "child") {
    return ageParts(people, asOf, [
      { label: "0 a 5 años", min: 0, max: 5 },
      { label: "6 a 12 años", min: 6, max: 12 },
    ]);
  }
  if (key === "mothers") {
    return [
      { label: "Gestantes", count: people.filter((p) => p.careGroup === "pregnant").length },
      { label: "lactantes", count: people.filter((p) => p.careGroup === "lactating").length },
    ];
  }
  return null;
}

function range(rates: number[]) {
  if (rates.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

export function buildG4Report(input: {
  groupName: string;
  mode: G4Mode;
  start: string;
  today: string;
  kitchens: { id: string; nombre: string }[];
  beneficiaries: G4Beneficiary[];
  pickups: G4Pickup[];
}) {
  const period = g4Period(input.mode, input.start, input.today);
  const end = period.until ?? period.to;
  const nameOf = new Map(input.kitchens.map((k) => [k.id, k.nombre]));
  const active = input.beneficiaries
    .filter((b) => b.activo && nameOf.has(b.comedor_id))
    .map((b) => ({ ...b, dni: b.dni.trim() }))
    .filter((b) => b.dni);

  const people = new Map<string, Person>();
  for (const b of active) {
    const p = people.get(b.dni) ?? {
      careGroup: null,
      birthDate: null,
      load: 0,
      phone: false,
      address: false,
      photo: false,
      kitchens: new Set<string>(),
    };
    p.careGroup ??= b.care_group;
    p.birthDate ??= b.birth_date;
    p.load = Math.max(p.load, Number(b.carga_familiar) || 0);
    p.phone ||= filled(b.telefono);
    p.address ||= filled(b.direccion);
    p.photo ||= filled(b.foto_url);
    p.kitchens.add(b.comedor_id);
    people.set(b.dni, p);
  }

  const dniById = new Map(input.beneficiaries.map((b) => [b.id, b.dni.trim()]));
  const served = new Set<string>();
  for (const pickup of input.pickups) {
    const dni = (pickup.beneficiario_id && dniById.get(pickup.beneficiario_id)) || (pickup.dni ?? "").trim();
    if (dni && people.has(dni)) served.add(dni);
  }

  const activePeople = people.size;
  const all = [...people.values()];
  const totalLoad = all.reduce((s, p) => s + p.load, 0);
  const newEntries = active.filter((b) => {
    const day = todayISO(new Date(b.created_at));
    return day >= period.from && day <= end;
  }).length;

  const byCategory = new Map<CategoryKey, Person[]>();
  for (const p of all) {
    const key = categoryOf(p.careGroup);
    byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
  }
  const categories: G4Category[] = CATEGORY_ORDER.map(({ key, label }) => {
    const members = byCategory.get(key) ?? [];
    return { key, label, people: members.length, parts: partsFor(key, members, end) };
  }).sort((a, b) => b.people - a.people);
  const unclassified = byCategory.get("unclassified")?.length ?? 0;
  if (unclassified > 0) categories.push({ key: "unclassified", label: "Sin clasificar", people: unclassified, parts: null });

  const rowsByKitchen = new Map<string, typeof active>();
  for (const b of active) rowsByKitchen.set(b.comedor_id, [...(rowsByKitchen.get(b.comedor_id) ?? []), b]);
  const rate = (rows: typeof active, pick: (b: G4Beneficiary) => string | null) =>
    rows.filter((b) => filled(pick(b))).length / rows.length;

  const kitchens = [...rowsByKitchen.entries()]
    .map(([id, rows]) => ({
      id,
      nombre: nameOf.get(id) ?? "Olla",
      inactive: rows.filter((b) => !served.has(b.dni)).length,
      phoneRate: rate(rows, (b) => b.telefono),
    }))
    .sort((a, b) => b.inactive - a.inactive || a.nombre.localeCompare(b.nombre, "es"));

  const kitchenRows = [...rowsByKitchen.values()];
  const completeness = (pick: (b: G4Beneficiary) => string | null, has: (p: Person) => boolean) => ({
    rate: activePeople ? all.filter(has).length / activePeople : 0,
    ...range(kitchenRows.map((rows) => rate(rows, pick))),
  });

  const pairCounts = new Map<string, { names: [string, string]; people: number }>();
  let inTwo = 0;
  let inThreeOrMore = 0;
  let maxKitchens = 0;
  for (const p of all) {
    if (p.kitchens.size < 2) continue;
    maxKitchens = Math.max(maxKitchens, p.kitchens.size);
    if (p.kitchens.size === 2) inTwo += 1;
    else inThreeOrMore += 1;
    const names = [...p.kitchens].map((id) => nameOf.get(id) ?? "Olla").sort((a, b) => a.localeCompare(b, "es"));
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = `${names[i]}\u0000${names[j]}`;
        const pair = pairCounts.get(key) ?? { names: [names[i]!, names[j]!] as [string, string], people: 0 };
        pair.people += 1;
        pairCounts.set(key, pair);
      }
    }
  }
  const pairs = [...pairCounts.values()].sort(
    (a, b) => b.people - a.people || a.names.join(" ").localeCompare(b.names.join(" "), "es"),
  );

  return {
    groupName: input.groupName,
    period,
    coverage: { withData: rowsByKitchen.size, total: input.kitchens.length },
    newEntries,
    activeRows: active.length,
    activePeople,
    coveredPeople: activePeople + totalLoad,
    averageLoad: activePeople ? totalLoad / activePeople : 0,
    servedPeople: served.size,
    usage: activePeople ? served.size / activePeople : 0,
    categories,
    kitchens,
    groupInactive: activePeople - served.size,
    groupPhoneRate: activePeople ? all.filter((p) => p.phone).length / activePeople : 0,
    completeness: {
      phone: completeness((b) => b.telefono, (p) => p.phone),
      address: completeness((b) => b.direccion, (p) => p.address),
      photo: completeness((b) => b.foto_url, (p) => p.photo),
    },
    duplicates: { people: inTwo + inThreeOrMore, inTwo, inThreeOrMore, maxKitchens, pairs },
  };
}

export type G4Report = ReturnType<typeof buildG4Report>;
