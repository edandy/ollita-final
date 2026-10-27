import { monthRange } from "./g3";

/** Hours each socia puts into one shift; the app does not record shift length. */
export const G5_HOURS_PER_SHIFT = 5;
/** Minimum wage (S/ 1 130) over 208 monthly hours. */
export const G5_HOURLY_VALUE = 5.43;
/** Kitchens covering fewer service days than this are flagged. */
export const G5_COVERAGE_ALERT = 0.7;
export const G5_BOARD_ROLES = ["presidenta", "tesorera", "almacenera"] as const;

export type G5Kitchen = { id: string; nombre: string; dias_atencion: string[] | null };
export type G5Member = { comedor_id: string; cargo: string; dni: string | null };
export type G5Person = { comedor_id: string; dni: string; sex: string | null };
export type G5Shift = { comedor_id: string; fecha: string; socias: string[] | null };

const WEEKDAY_CODES = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

function weekdayCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function addDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function serviceDates(diasAtencion: string[] | null, from: string, to: string) {
  const days = new Set((diasAtencion ?? []).map(weekdayCode));
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addDay(cur)) {
    if (days.has(WEEKDAY_CODES[new Date(`${cur}T12:00:00Z`).getUTCDay()]!)) out.push(cur);
  }
  return out;
}

function socias(shift: G5Shift) {
  return (shift.socias ?? []).map((s) => s.trim()).filter(Boolean);
}

export function buildG5Report(input: {
  groupName: string;
  monthStart: string;
  today: string;
  kitchens: G5Kitchen[];
  members: G5Member[];
  people: G5Person[];
  shifts: G5Shift[];
  supervisedKitchenIds: string[];
}) {
  const range = monthRange(input.monthStart);
  const until = input.today >= range.from && input.today < range.to ? input.today : null;
  const month = { ...range, until };
  const end = until ?? range.to;

  const shiftsInMonth = input.shifts.filter((s) => s.fecha >= range.from && s.fecha <= end);
  const sexOf = new Map(input.people.map((p) => [`${p.comedor_id}|${p.dni.trim()}`, p.sex]));
  const supervised = new Set(input.supervisedKitchenIds);

  const kitchens = input.kitchens.map((k) => {
    const own = shiftsInMonth.filter((s) => s.comedor_id === k.id);
    const staffed = own.filter((s) => socias(s).length > 0);
    const covered = new Set(staffed.map((s) => s.fecha));
    const due = serviceDates(k.dias_atencion, range.from, end);
    const roles = new Set(input.members.filter((m) => m.comedor_id === k.id).map((m) => m.cargo));
    return {
      id: k.id,
      nombre: k.nombre,
      hasData: own.length > 0,
      missing: own.length > 0 ? G5_BOARD_ROLES.filter((r) => !roles.has(r)) : [],
      coveredDays: due.filter((d) => covered.has(d)).length,
      serviceDays: due.length,
      coverage: due.length ? due.filter((d) => covered.has(d)).length / due.length : 0,
      hours: staffed.reduce((s, shift) => s + socias(shift).length, 0) * G5_HOURS_PER_SHIFT,
      sociasEnTurnos: new Set(staffed.flatMap((s) => socias(s).map((n) => n.toLowerCase()))).size,
    };
  });
  kitchens.sort((a, b) => Number(b.hasData) - Number(a.hasData) || b.hours - a.hours || a.nombre.localeCompare(b.nombre, "es"));

  const withData = kitchens.filter((k) => k.hasData);
  const dataIds = new Set(withData.map((k) => k.id));
  const boardMembers = input.members.filter(
    (m) => dataIds.has(m.comedor_id) && (G5_BOARD_ROLES as readonly string[]).includes(m.cargo),
  );
  const sexes = boardMembers.map((m) => (m.dni ? sexOf.get(`${m.comedor_id}|${m.dni.trim()}`) ?? null : null));
  const known = sexes.filter((s) => s != null).length;
  const women = sexes.filter((s) => s === "female").length;
  const count = (cargo: string) => boardMembers.filter((m) => m.cargo === cargo).length;
  const sociasEnTurnos = withData.reduce((s, k) => s + k.sociasEnTurnos, 0);
  const due = withData.reduce((s, k) => s + k.serviceDays, 0);
  const hours = kitchens.reduce((s, k) => s + k.hours, 0);

  return {
    groupName: input.groupName,
    month,
    coverage: { withData: withData.length, total: input.kitchens.length },
    supervised: { count: input.kitchens.filter((k) => supervised.has(k.id)).length, total: input.kitchens.length },
    boards: { complete: withData.filter((k) => k.missing.length === 0).length, evaluated: withData.length },
    shiftCoverage: due ? withData.reduce((s, k) => s + k.coveredDays, 0) / due : 0,
    hours,
    workValue: hours * G5_HOURLY_VALUE,
    women: { women, known, unknown: sexes.length - known, rate: known ? women / known : 0 },
    roles: {
      presidentas: count("presidenta"),
      tesoreras: count("tesorera"),
      almaceneras: count("almacenera"),
      sociasEnTurnos,
      total: boardMembers.length + sociasEnTurnos,
    },
    kitchens: kitchens.map(({ id, nombre, hasData, missing, coverage, hours: h }) => ({
      id,
      nombre,
      hasData,
      missing: [...missing],
      coverage,
      hours: h,
    })),
  };
}

export type G5Report = ReturnType<typeof buildG5Report>;
