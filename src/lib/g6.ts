import { weekRangeMonSat } from "./g1";
import { coverageDays, dailyUsage, g2Cutoff, isG2Alert, stockAtCutoff, type G2Movement } from "./g2";
import { serviceDates } from "./g5";

/** Days without menu, open cash days or supplies in alert at this count turn a kitchen red. */
export const G6_ATTEND_AT = 2;

export type G6Status = "attend" | "review" | "ok" | "noData";
export type G6Counts = { noMenu: number; openCash: number; supplyAlerts: number; expired: number; pending: number };

export type G6Kitchen = { id: string; nombre: string; dias_atencion: string[] | null };
export type G6Menu = { comedor_id: string; fecha: string; publicado: boolean };
export type G6CashDay = { comedor_id: string; fecha: string; cerrado: boolean };
export type G6Supply = { id: string; comedor_id: string; nombre: string; stock_actual: number };
export type G6Person = { comedor_id: string; vigencia_hasta: string | null };
/** A `pendiente` reservation, dated by its menu. */
export type G6Pending = { comedor_id: string; fecha: string };

const STATUS_ORDER: G6Status[] = ["attend", "review", "ok", "noData"];
const NO_DATA_ACTION = "Sin registros: llamar a la presidenta";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function joinWords(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} y ${words.at(-1)}`;
}

export function g6Status(c: G6Counts): Exclude<G6Status, "noData"> {
  if (Math.max(c.noMenu, c.openCash, c.supplyAlerts) >= G6_ATTEND_AT) return "attend";
  if (c.noMenu + c.openCash + c.supplyAlerts + c.expired + c.pending > 0) return "review";
  return "ok";
}

/** The first thing to fix: the biggest of menus, cash and supplies (supplies win ties), then pickups, then cards. */
export function g6Action(c: G6Counts, alertSupplies: { nombre: string; days: number }[]) {
  const lead = Math.max(c.noMenu, c.openCash, c.supplyAlerts);
  if (lead > 0 && c.supplyAlerts === lead && alertSupplies.length > 0) {
    const min = Math.min(...alertSupplies.map((s) => s.days));
    const names = alertSupplies
      .filter((s) => s.days === min)
      .map((s, i) => (i === 0 ? s.nombre : s.nombre.toLowerCase()));
    if (min > 0) return `${joinWords(names)} para ${plural(min, "día", "días")}`;
    return `${joinWords(names)} ${names.length === 1 ? "agotado" : "agotados"}`;
  }
  if (lead > 0) {
    if (c.noMenu === 1 && c.openCash === 0) return "1 día sin menú publicado";
    const parts = [
      c.noMenu ? plural(c.noMenu, "día sin menú", "días sin menú") : null,
      c.openCash ? plural(c.openCash, "caja sin cerrar", "cajas sin cerrar") : null,
    ].filter((p): p is string => p != null);
    return parts.join(" y ");
  }
  if (c.pending > 0 && c.pending >= c.expired) {
    return `Confirmar ${plural(c.pending, "entrega pendiente", "entregas pendientes")}`;
  }
  if (c.expired > 0) return `Renovar ${plural(c.expired, "carné vencido", "carnés vencidos")}`;
  return null;
}

export function buildG6Report(input: {
  groupName: string;
  weekStart: string;
  today: string;
  kitchens: G6Kitchen[];
  menus: G6Menu[];
  cashDays: G6CashDay[];
  supplies: G6Supply[];
  movements: Pick<G2Movement, "insumo_id" | "tipo" | "cantidad" | "fecha" | "transfer_id">[];
  people: G6Person[];
  pendingReservations: G6Pending[];
}) {
  const range = weekRangeMonSat(input.weekStart);
  const cutoff = g2Cutoff(range.to, input.today);
  const week = { ...range, cutoff };
  const inWeek = (fecha: string) => fecha >= range.from && fecha <= range.to;

  const movementsBySupply = new Map<string, typeof input.movements>();
  for (const m of input.movements) {
    movementsBySupply.set(m.insumo_id, [...(movementsBySupply.get(m.insumo_id) ?? []), m]);
  }

  const kitchens = input.kitchens.map((k) => {
    const menus = input.menus.filter((m) => m.comedor_id === k.id && inWeek(m.fecha));
    const cash = input.cashDays.filter((d) => d.comedor_id === k.id && inWeek(d.fecha));
    const hasData = menus.length > 0 || cash.length > 0;
    if (!hasData) {
      return {
        id: k.id,
        nombre: k.nombre,
        status: "noData" as G6Status,
        noMenu: 0,
        openCash: 0,
        supplyAlerts: 0,
        expired: 0,
        pending: 0,
        action: NO_DATA_ACTION as string | null,
      };
    }

    const due = serviceDates(k.dias_atencion, range.from, cutoff);
    const published = new Set(menus.filter((m) => m.publicado).map((m) => m.fecha));
    const closed = new Set(cash.filter((d) => d.cerrado).map((d) => d.fecha));
    const alertSupplies = input.supplies
      .filter((s) => s.comedor_id === k.id)
      .map((s) => {
        const movements = movementsBySupply.get(s.id) ?? [];
        return {
          nombre: s.nombre,
          days: coverageDays(stockAtCutoff(s.stock_actual, cutoff, movements), dailyUsage(cutoff, movements)),
        };
      })
      .filter((s): s is { nombre: string; days: number } => isG2Alert(s.days));

    const counts: G6Counts = {
      noMenu: due.filter((d) => !published.has(d)).length,
      // Today's cash may still be open.
      openCash: due.filter((d) => d < input.today && !closed.has(d)).length,
      supplyAlerts: alertSupplies.length,
      expired: input.people.filter(
        (p) => p.comedor_id === k.id && p.vigencia_hasta != null && p.vigencia_hasta < cutoff,
      ).length,
      pending: input.pendingReservations.filter(
        (r) => r.comedor_id === k.id && r.fecha >= range.from && r.fecha <= cutoff && r.fecha < input.today,
      ).length,
    };
    return {
      id: k.id,
      nombre: k.nombre,
      status: g6Status(counts) as G6Status,
      ...counts,
      action: g6Action(counts, alertSupplies),
    };
  });

  const sum = (c: G6Counts) => c.noMenu + c.openCash + c.supplyAlerts + c.expired + c.pending;
  kitchens.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      sum(b) - sum(a) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );

  const withData = kitchens.filter((k) => k.status !== "noData");
  const total = (key: keyof G6Counts) => withData.reduce((s, k) => s + k[key], 0);
  const inAlert = withData.filter((k) => k.supplyAlerts > 0).length;

  return {
    groupName: input.groupName,
    week,
    coverage: { withData: withData.length, total: input.kitchens.length },
    counts: {
      attend: kitchens.filter((k) => k.status === "attend").length,
      review: kitchens.filter((k) => k.status === "review").length,
      ok: kitchens.filter((k) => k.status === "ok").length,
      noData: kitchens.filter((k) => k.status === "noData").length,
    },
    kitchens,
    totals: {
      noMenu: total("noMenu"),
      openCash: total("openCash"),
      supplyAlerts: total("supplyAlerts"),
      expired: total("expired"),
      pending: total("pending"),
    },
    totalsAction: inAlert
      ? `${plural(inAlert, "comedor", "comedores")} con insumos en alerta`
      : "Sin insumos en alerta",
  };
}

export type G6Report = ReturnType<typeof buildG6Report>;
