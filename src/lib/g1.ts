export const GRAMS_PER_SERVING = 330;
export const LOW_OCCUPANCY = 0.9;

export type G1Kitchen = { id: string; nombre: string };

export type G1Menu = {
  id: string;
  comedor_id: string;
  fecha: string;
  publicado: boolean;
  raciones_disponibles: number;
};

export type G1Reservation = {
  menu_id: string;
  comedor_id: string;
  cantidad: number;
  estado: "pendiente" | "recogida" | "no_recogida" | string;
  codigo: string;
  dni: string | null;
  beneficiario_id: string | null;
  categoria?: string | null;
  subtipo?: string | null;
};

export type G1KitchenRow = {
  id: string;
  nombre: string;
  prepared: number;
  delivered: number;
  leftover: number;
  occupancy: number;
  hasData: boolean;
  uniquePeople: number;
};

export type G1CategoryRow = {
  key: string;
  label: string;
  servings: number;
};

export type G1Report = {
  groupName: string;
  week: { from: string; to: string; label: string };
  kitchens: G1KitchenRow[];
  totals: {
    prepared: number;
    delivered: number;
    leftover: number;
    occupancy: number;
    occupancyMin: number;
    occupancyMax: number;
  };
  coverage: { withData: number; total: number };
  uniquePeople: { group: number; sumKitchens: number };
  channels: { padron: number; libre: number };
  categories: G1CategoryRow[];
  leftoverKg: number;
  leftoverLeaders: { nombre: string; leftover: number }[];
};

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekRangeMonSat(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const daysFromMonday = (d.getUTCDay() + 6) % 7;
  const from = addDaysISO(isoDate, -daysFromMonday);
  const to = addDaysISO(from, 5);
  return { from, to, label: weekLabel(from, to) };
}

export function shiftWeek(weekStart: string, weeks: number) {
  const { from } = weekRangeMonSat(weekStart);
  return addDaysISO(from, weeks * 7);
}

function weekLabel(from: string, to: string) {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  if (fy === ty && fm === tm) return `${Number(fd)} al ${td}/${tm}/${ty}`;
  if (fy === ty) return `${fd}/${fm} al ${td}/${tm}/${ty}`;
  return `${fd}/${fm}/${fy} al ${td}/${tm}/${ty}`;
}

export function preparedServings(remaining: number, reservedQty: number) {
  return Math.max(0, remaining) + Math.max(0, reservedQty);
}

export function occupancy(delivered: number, prepared: number) {
  if (prepared <= 0) return 0;
  return delivered / prepared;
}

export function isLowOccupancy(rate: number) {
  return rate < LOW_OCCUPANCY;
}

export function leftoverKg(servings: number) {
  return Math.round((Math.max(0, servings) * GRAMS_PER_SERVING) / 1000);
}

export function isPadronChannel(input: { codigo: string; beneficiario_id: string | null }) {
  if (input.beneficiario_id) return true;
  return (input.codigo ?? "").toUpperCase().startsWith("E");
}

export function personKey(input: { dni: string | null; beneficiario_id: string | null }) {
  const dni = (input.dni ?? "").trim();
  if (dni) return dni;
  const id = (input.beneficiario_id ?? "").trim();
  return id || null;
}

export function categoryLabel(categoria: string | null | undefined, subtipo: string | null | undefined) {
  if (categoria === "socia_familia") return "Familia de socia";
  if (categoria === "publico_recurrente") return "Público recurrente";
  if (categoria === "caso_social") {
    if (subtipo === "adulto_mayor") return "Adulto mayor";
    if (subtipo === "madre_soltera") return "Madre soltera";
    return "Caso social";
  }
  return "Otra";
}

export function kitchensForG1(input: {
  groupKitchenIds: string[];
  assignedKitchenIds: string[];
  isAdmin: boolean;
}) {
  if (input.isAdmin) return [...new Set(input.groupKitchenIds.filter(Boolean))];
  const allowed = new Set(input.assignedKitchenIds);
  return [...new Set(input.groupKitchenIds.filter((id) => allowed.has(id)))];
}

export function groupsForG1<T extends { kitchenIds: string[] }>(
  groups: T[],
  input: { isAdmin: boolean; assignedKitchenIds: string[] },
) {
  if (input.isAdmin) return groups;
  const allowed = new Set(input.assignedKitchenIds);
  return groups.filter((g) => g.kitchenIds.some((id) => allowed.has(id)));
}

export function formatG1Number(n: number) {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = String(Math.abs(rounded));
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatG1Percent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function buildG1Report(input: {
  groupName: string;
  weekStart: string;
  kitchens: G1Kitchen[];
  menus: G1Menu[];
  reservations: G1Reservation[];
}): G1Report {
  const week = weekRangeMonSat(input.weekStart);
  const menus = input.menus.filter(
    (m) => m.publicado && m.fecha >= week.from && m.fecha <= week.to,
  );
  const menusById = new Map(menus.map((m) => [m.id, m]));
  const reservations = input.reservations.filter((r) => menusById.has(r.menu_id));

  const kitchenRows: G1KitchenRow[] = input.kitchens.map((kitchen) => {
    const kitchenMenus = menus.filter((m) => m.comedor_id === kitchen.id);
    const hasData = kitchenMenus.length > 0;
    if (!hasData) {
      return {
        id: kitchen.id,
        nombre: kitchen.nombre,
        prepared: 0,
        delivered: 0,
        leftover: 0,
        occupancy: 0,
        hasData: false,
        uniquePeople: 0,
      };
    }
    const kitchenReservations = reservations.filter((r) => kitchenMenus.some((m) => m.id === r.menu_id));
    const reservedByMenu = new Map<string, number>();
    for (const r of kitchenReservations) {
      reservedByMenu.set(r.menu_id, (reservedByMenu.get(r.menu_id) ?? 0) + r.cantidad);
    }
    const prepared = kitchenMenus.reduce(
      (sum, m) => sum + preparedServings(m.raciones_disponibles, reservedByMenu.get(m.id) ?? 0),
      0,
    );
    const delivered = kitchenReservations
      .filter((r) => r.estado === "recogida")
      .reduce((sum, r) => sum + r.cantidad, 0);
    const people = new Set(
      kitchenReservations
        .filter((r) => r.estado === "recogida")
        .map(personKey)
        .filter((k): k is string => !!k),
    );
    return {
      id: kitchen.id,
      nombre: kitchen.nombre,
      prepared,
      delivered,
      leftover: Math.max(0, prepared - delivered),
      occupancy: occupancy(delivered, prepared),
      hasData: true,
      uniquePeople: people.size,
    };
  });

  const withData = kitchenRows.filter((k) => k.hasData);
  const withoutData = kitchenRows.filter((k) => !k.hasData);
  withData.sort((a, b) => b.prepared - a.prepared || a.nombre.localeCompare(b.nombre, "es"));
  const kitchens = [...withData, ...withoutData];

  const prepared = withData.reduce((s, k) => s + k.prepared, 0);
  const delivered = withData.reduce((s, k) => s + k.delivered, 0);
  const leftover = Math.max(0, prepared - delivered);
  const rates = withData.filter((k) => k.prepared > 0).map((k) => k.occupancy);

  const deliveredRows = reservations.filter((r) => r.estado === "recogida");
  let padron = 0;
  let libre = 0;
  const groupPeople = new Set<string>();
  const categoryMap = new Map<string, G1CategoryRow>();
  for (const r of deliveredRows) {
    const key = personKey(r);
    if (key) groupPeople.add(key);
    if (isPadronChannel(r)) {
      padron += r.cantidad;
      const label = categoryLabel(r.categoria, r.subtipo);
      const catKey = `${r.categoria ?? "otra"}:${r.subtipo ?? ""}`;
      const row = categoryMap.get(catKey) ?? { key: catKey, label, servings: 0 };
      row.servings += r.cantidad;
      categoryMap.set(catKey, row);
    } else {
      libre += r.cantidad;
    }
  }

  const leftoverLeaders = [...withData]
    .filter((k) => k.leftover > 0)
    .sort((a, b) => b.leftover - a.leftover)
    .slice(0, 3)
    .map((k) => ({ nombre: k.nombre, leftover: k.leftover }));

  return {
    groupName: input.groupName,
    week,
    kitchens,
    totals: {
      prepared,
      delivered,
      leftover,
      occupancy: occupancy(delivered, prepared),
      occupancyMin: rates.length ? Math.min(...rates) : 0,
      occupancyMax: rates.length ? Math.max(...rates) : 0,
    },
    coverage: { withData: withData.length, total: kitchenRows.length },
    uniquePeople: {
      group: groupPeople.size,
      sumKitchens: withData.reduce((s, k) => s + k.uniquePeople, 0),
    },
    channels: { padron, libre },
    categories: [...categoryMap.values()].sort((a, b) => b.servings - a.servings),
    leftoverKg: leftoverKg(leftover),
    leftoverLeaders,
  };
}
