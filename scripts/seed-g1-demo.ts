import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "../src/lib/dates";
import { emailDeDni, claveDePin } from "../src/lib/dni-cuenta";
import { G1_DEMO_KITCHEN_STAFF, G1_DEMO_PIN } from "../src/lib/g1-demo";
import { shiftWeek, weekRangeMonSat } from "../src/lib/g1";
import { baselineRange, monthRange } from "../src/lib/g3";
import { staffToPadronRow, type CareGroup, type Sex } from "../src/lib/padron";
import { CODE_ALPHABET, generateKitchenCode } from "../src/lib/reservas";

const GROUP_NAME = "VES Sur Demo";
const DEMO_PASSWORD = "OllitaDemo1";
const PREFIX = "Demo · ";

const SUPERVISORS = [
  {
    key: "rosa",
    name: "Rosa Quispe",
    email: "rosa.demo@laollita.pe",
    dni: "88880001",
    phone: "999888001",
    accessLevel: "full" as const,
    kitchenKeys: ["carmen", "cristo", "santa", "flores", "villa"],
  },
  {
    key: "luis",
    name: "Luis Huamán",
    email: "luis.demo@laollita.pe",
    dni: "88880002",
    phone: "999888002",
    accessLevel: "view" as const,
    kitchenKeys: ["carmen", "cristo", "santa"],
  },
];

const KITCHENS = [
  {
    key: "carmen",
    nombre: `${PREFIX}Virgen del Carmen`,
    code: "D2VC1",
    distrito: "Villa El Salvador",
    direccion: "Av. Revolución 120",
    seed: true,
    prepared: 100,
    delivered: 98,
  },
  {
    key: "cristo",
    nombre: `${PREFIX}Cristo Rey`,
    code: "D2CR2",
    distrito: "Villa El Salvador",
    direccion: "Jr. Los Héroes 45",
    seed: true,
    prepared: 100,
    delivered: 88,
  },
  {
    key: "santa",
    nombre: `${PREFIX}Santa María`,
    code: "D2SM3",
    distrito: "Villa El Salvador",
    direccion: "Mz. D Lt. 8, sector 2",
    seed: true,
    prepared: 80,
    delivered: 75,
  },
  {
    key: "flores",
    nombre: `${PREFIX}Las Flores`,
    code: "D2LF4",
    distrito: "Villa El Salvador",
    direccion: "Calle Las Palmas 210",
    seed: true,
    prepared: 70,
    delivered: 66,
  },
  {
    key: "villa",
    nombre: `${PREFIX}Villa Hermosa`,
    code: "D2VH5",
    distrito: "Villa El Salvador",
    direccion: "Av. Pachacútec 980",
    seed: false,
    prepared: 0,
    delivered: 0,
  },
] as const;

const SUPPLIES = [
  { key: "arroz", nombre: "Arroz", unidad: "kg", dailyUse: 10, precio: 4.2 },
  { key: "aceite", nombre: "Aceite", unidad: "L", dailyUse: 1.5, precio: 9.5 },
  { key: "azucar", nombre: "Azúcar", unidad: "kg", dailyUse: 1, precio: 3.8 },
  { key: "fideos", nombre: "Fideos", unidad: "kg", dailyUse: 3.5, precio: 5 },
  { key: "menestras", nombre: "Menestras", unidad: "kg", dailyUse: 2, precio: 7 },
  { key: "leche", nombre: "Leche evaporada", unidad: "unid", dailyUse: 6, precio: 3.9 },
] as const;

// Days of coverage each seeded kitchen ends with; under 4 shows up as an alert in G2.
const SUPPLY_DAYS = {
  carmen: { arroz: 8, aceite: 6, azucar: 9, fideos: 7, menestras: 12, leche: 10 },
  cristo: { arroz: 3, aceite: 2, azucar: 5, fideos: 3, menestras: 6, leche: 5 },
  santa: { arroz: 7, aceite: 3, azucar: 3, fideos: 6, menestras: 8, leche: 3 },
  flores: { arroz: 5, aceite: 2, azucar: 3, fideos: 5, menestras: 4, leche: 7 },
} as const;

// G3: share of this month's usage each kitchen used per serving in the 3 previous months.
// Below 1 means the kitchen now uses more than usual, which G3 reports as merma.
const USAGE_BEFORE = { carmen: 1, cristo: 0.88, santa: 1, flores: 0.95 } as const;

const DISHES = [
  "Arroz con pollo",
  "Lentejas con arroz",
  "Tallarines rojos",
  "Ají de gallina",
  "Arroz chaufa",
  "Estofado de pollo",
  "Frejoles con arroz",
  "Sudado de jurel",
  "Tortilla de verduras",
  "Seco de res",
] as const;

// How many dishes each kitchen rotates through; Las Flores serves each dish 3 days in a row.
const DISH_ROTATION = {
  carmen: { dishes: 9, run: 1 },
  cristo: { dishes: 4, run: 1 },
  santa: { dishes: 7, run: 1 },
  flores: { dishes: 6, run: 3 },
} as const;

const SHARED_DNI = "88881111";

type DemoBeneficiary = {
  dni: string;
  nombre: string;
  categoria: "socia_familia" | "publico_recurrente" | "caso_social";
  subtipo: "adulto_mayor" | "madre_soltera" | "otro" | null;
  careGroup: CareGroup | null;
  birthDate: string | null;
  sex: Sex;
};

// In every seeded kitchen and picking up all week, so G1 shows them in each padrón.
const BENEFICIARIES: DemoBeneficiary[] = [
  { dni: SHARED_DNI, nombre: "Elena Ramos", categoria: "socia_familia", subtipo: null, careGroup: "lactating", birthDate: "1996-04-12", sex: "female" },
  { dni: "88881112", nombre: "Pedro Vargas", categoria: "caso_social", subtipo: "adulto_mayor", careGroup: "older_adult", birthDate: "1948-08-20", sex: "male" },
  { dni: "88881113", nombre: "Juana Díaz", categoria: "caso_social", subtipo: "madre_soltera", careGroup: "pregnant", birthDate: "1999-02-03", sex: "female" },
  { dni: "88881114", nombre: "Mario Soto", categoria: "caso_social", subtipo: "otro", careGroup: "disability", birthDate: "1980-11-30", sex: "male" },
  { dni: "88881115", nombre: "Ana Paredes", categoria: "publico_recurrente", subtipo: null, careGroup: "social_case", birthDate: "1975-06-15", sex: "female" },
  { dni: "88881116", nombre: "Rosa Mendoza", categoria: "socia_familia", subtipo: null, careGroup: "older_adult", birthDate: "1958-01-09", sex: "female" },
];

// G5: board members besides each kitchen's presidenta (G1_DEMO_KITCHEN_STAFF). Cristo Rey and Las Flores
// have no almacenera and Santa María no tesorera, so G5 shows those boards as incomplete.
const BOARD_STAFF: {
  kitchenKey: "carmen" | "cristo" | "santa" | "flores";
  nombre: string;
  dni: string;
  telefono: string;
  cargo: "tesorera" | "almacenera";
  sex: Sex;
}[] = [
  { kitchenKey: "carmen", nombre: "Lucía Ramos", dni: "88883111", telefono: "999888111", cargo: "tesorera", sex: "female" },
  { kitchenKey: "carmen", nombre: "Gloria Ccahuana", dni: "88883112", telefono: "999888112", cargo: "almacenera", sex: "female" },
  { kitchenKey: "cristo", nombre: "Julio Mendoza", dni: "88883121", telefono: "999888121", cargo: "tesorera", sex: "male" },
  { kitchenKey: "santa", nombre: "Norma Huamán", dni: "88883131", telefono: "999888131", cargo: "almacenera", sex: "female" },
  { kitchenKey: "flores", nombre: "Pilar Rojas", dni: "88883141", telefono: "999888141", cargo: "tesorera", sex: "female" },
];

// G5: share of service days with a shift in the cronograma; under 70% shows in red.
const SHIFT_COVERAGE = { carmen: 1, cristo: 0.64, santa: 0.77, flores: 0.92 } as const;
const SERVICE_DAYS = ["lun", "mar", "mie", "jue", "vie", "sab"];

// G6: last week's alerts. Menus are skipped and cash left open on these indexes of last week's service
// days; the first `expired` social cases have lapsed and `pending` pickups were never confirmed. This week
// only today's cash is open, so the current week shows supply alerts alone.
const WEEK_ALERTS: Record<"carmen" | "cristo" | "santa" | "flores", {
  noMenuDays: number[];
  openCashDays: number[];
  expired: number;
  pending: number;
}> = {
  carmen: { noMenuDays: [], openCashDays: [], expired: 0, pending: 0 },
  cristo: { noMenuDays: [1, 3], openCashDays: [2, 4], expired: 7, pending: 9 },
  santa: { noMenuDays: [], openCashDays: [0], expired: 2, pending: 3 },
  flores: { noMenuDays: [], openCashDays: [5], expired: 3, pending: 2 },
};

// G4: generated padrón per seeded kitchen. phone, address and photo set the completeness the report
// shows; unused is the share of people who never pick up, which G4 lists as "inactivos de hecho".
const PADRON = {
  carmen: { size: 34, phone: 0.95, address: 0.9, photo: 0.6, unused: 0.1 },
  cristo: { size: 28, phone: 0.4, address: 0.7, photo: 0.1, unused: 0.35 },
  santa: { size: 24, phone: 0.65, address: 1, photo: 0.3, unused: 0.2 },
  flores: { size: 22, phone: 0.8, address: 0.85, photo: 0, unused: 0.15 },
} as const;

// G4: people of one kitchen's generated padrón who are also in other kitchens (index → kitchens).
const PADRON_SHARED: { from: keyof typeof PADRON; index: number; also: (keyof typeof PADRON)[] }[] = [
  { from: "carmen", index: 0, also: ["cristo"] },
  { from: "carmen", index: 1, also: ["cristo"] },
  { from: "carmen", index: 2, also: ["cristo", "santa"] },
  { from: "santa", index: 0, also: ["flores"] },
  { from: "flores", index: 0, also: ["cristo"] },
];

const CARE_CYCLE: (CareGroup | null)[] = [
  "older_adult", "child", "older_adult", "social_case", "child", "disability", "older_adult", "pregnant",
  "child", "older_adult", "social_case", "lactating", "child", "disability", "older_adult", null,
  "child", "older_adult", "social_case", "disability", "older_adult", "child", "lactating", "social_case", null,
];

const FIRST_NAMES = ["Carmen", "Luz", "Teresa", "Julio", "Nilda", "Óscar", "Marina", "Hilda", "Víctor", "Sonia", "Félix", "Gladys"];
const LAST_NAMES = ["Huamán", "Quispe", "Flores", "Mamani", "Rojas", "Chávez", "Torres", "Ccahuana", "Salazar", "Pumacayo"];

function ageFor(careGroup: CareGroup | null, i: number) {
  if (careGroup === "older_adult") return 60 + ((i * 7) % 28);
  if (careGroup === "child") return (i * 5) % 13;
  if (careGroup === "pregnant" || careGroup === "lactating") return 18 + ((i * 3) % 22);
  return 20 + ((i * 11) % 45);
}

/** Deterministic share test so re-runs give the same padrón. */
function within(i: number, salt: number, rate: number) {
  return ((i * salt) % 100) / 100 < rate;
}

function generatedPadron(kitchenIndex: number, kitchenKey: keyof typeof PADRON, year: number) {
  const cfg = PADRON[kitchenKey];
  return Array.from({ length: cfg.size }, (_, i) => {
    const careGroup = CARE_CYCLE[(i + kitchenIndex * 3) % CARE_CYCLE.length]!;
    const age = ageFor(careGroup, i + kitchenIndex);
    const dni = `8889${String(kitchenIndex + 1).padStart(2, "0")}${String(i).padStart(2, "0")}`;
    return {
      dni,
      nombre: `${FIRST_NAMES[(i + kitchenIndex) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3 + kitchenIndex) % LAST_NAMES.length]}`,
      categoria: careGroup === "older_adult" ? ("caso_social" as const) : i % 2 ? ("publico_recurrente" as const) : ("socia_familia" as const),
      subtipo: careGroup === "older_adult" ? ("adulto_mayor" as const) : null,
      careGroup,
      birthDate: `${year - age - 1}-${String((i % 12) + 1).padStart(2, "0")}-${String(((i * 3) % 27) + 1).padStart(2, "0")}`,
      carga: (i * 3) % 6,
      sex: (careGroup === "pregnant" || careGroup === "lactating" ? "female" : i % 11 === 10 ? null : i % 3 === 1 ? "male" : "female") as Sex | null,
      activo: i % 13 !== 12,
      telefono: within(i, 37, cfg.phone) ? `9${dni}` : null,
      direccion: within(i, 53, cfg.address) ? `Mz. ${String.fromCharCode(65 + (i % 8))} Lt. ${i + 1}` : null,
      fotoUrl: within(i, 71, cfg.photo) ? "/favicon.png" : null,
      // A few joined this month, so G4 shows new entries.
      newThisMonth: i % 9 === 4,
      // The last share of the list never picks up.
      picksUp: i < Math.round(cfg.size * (1 - cfg.unused)),
    };
  });
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function throwIf(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function datesInRange(from: string, to: string) {
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    const d = new Date(`${cur}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return days;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isServiceDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() !== 0;
}

function suffix(n: number) {
  let x = n;
  let s = "";
  for (let i = 0; i < 4; i++) {
    s = CODE_ALPHABET[x % CODE_ALPHABET.length] + s;
    x = Math.floor(x / CODE_ALPHABET.length);
  }
  return s;
}

function splitServings(total: number, parts: number) {
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0)).filter((n) => n > 0);
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todayISO();
  const week = weekRangeMonSat(today);
  const days = datesInRange(week.from, week.to);
  const month = monthRange(today);
  const historyStart = baselineRange(month.from).from;
  const serviceDays = datesInRange(historyStart, week.to).filter(isServiceDay);
  const dishFor = (kitchenKey: string, fecha: string) => {
    const rotation = DISH_ROTATION[kitchenKey as keyof typeof DISH_ROTATION];
    const i = Math.floor(serviceDays.indexOf(fecha) / rotation.run);
    return DISHES[i % rotation.dishes];
  };
  let codeSeq = 1;
  const lastWeek = weekRangeMonSat(shiftWeek(week.from, -1));
  const lastWeekDays = serviceDays.filter((d) => d >= lastWeek.from && d <= lastWeek.to);
  const alertsOf = (key: string) => WEEK_ALERTS[key as keyof typeof WEEK_ALERTS];
  const lastWeekDay = (key: string, field: "noMenuDays" | "openCashDays", fecha: string) =>
    alertsOf(key)[field].includes(lastWeekDays.indexOf(fecha));
  // Social cases carry a vigencia: lapsed before last week for G6's "padrón vencido", the rest until year end.
  const lapsedOn = addDays(lastWeek.from, -12);
  const yearEnd = `${today.slice(0, 4)}-12-31`;

  const kitchenIds: Record<string, string> = {};
  const kitchenCodes: Record<string, string> = {};

  for (const k of KITCHENS) {
    const { data: existing, error: findErr } = await supabase
      .from("comedores")
      .select("id,code")
      .eq("nombre", k.nombre)
      .maybeSingle();
    throwIf(findErr, `buscar ${k.nombre}`);

    if (existing) {
      kitchenIds[k.key] = existing.id;
      kitchenCodes[k.key] = existing.code;
      continue;
    }

    let code = k.code;
    const { data: taken } = await supabase.from("comedores").select("id").eq("code", code).maybeSingle();
    if (taken) code = generateKitchenCode();

    const { data: row, error } = await supabase
      .from("comedores")
      .insert({
        nombre: k.nombre,
        tipo: "comedor",
        distrito: k.distrito,
        direccion: k.direccion,
        lat: -12.2135,
        lng: -76.938,
        code,
        activo: true,
        raciones_diarias: k.prepared || 80,
        precio_menu: 5,
        descripcion: "g1-demo",
        allow_public_reservations: true,
      })
      .select("id,code")
      .single();
    throwIf(error, `crear ${k.nombre}`);
    kitchenIds[k.key] = row!.id;
    kitchenCodes[k.key] = row!.code;
  }

  const allKitchenIds = Object.values(kitchenIds);

  let { data: group, error: groupFindErr } = await supabase
    .from("groups")
    .select("id,name")
    .ilike("name", GROUP_NAME)
    .maybeSingle();
  throwIf(groupFindErr, "buscar grupo");
  if (!group) {
    const created = await supabase.from("groups").insert({ name: GROUP_NAME }).select("id,name").single();
    throwIf(created.error, "crear grupo");
    group = created.data;
  }

  const { error: delLinksErr } = await supabase.from("group_kitchens").delete().eq("group_id", group!.id);
  throwIf(delLinksErr, "limpiar ollas del grupo");
  const { error: linkErr } = await supabase.from("group_kitchens").insert(
    allKitchenIds.map((comedor_id) => ({ group_id: group!.id, comedor_id })),
  );
  throwIf(linkErr, "asignar ollas al grupo");

  // Menus are seeded Monday to Saturday, so the kitchens serve those days (G5 shift coverage).
  const { error: daysErr } = await supabase
    .from("comedores")
    .update({ dias_atencion: SERVICE_DAYS })
    .in("id", allKitchenIds);
  throwIf(daysErr, "días de atención");

  const seededIds = KITCHENS.filter((k) => k.seed).map((k) => kitchenIds[k.key]!);
  const { error: delMenusErr } = await supabase
    .from("menus")
    .delete()
    .in("comedor_id", seededIds)
    .gte("fecha", historyStart)
    .lte("fecha", week.to);
  throwIf(delMenusErr, "borrar menús demo");

  // Padrón: the shared demo people plus each kitchen's generated list, upserted so re-runs are stable.
  const beneficiaryIds: Record<string, Record<string, string>> = {};
  const generated = Object.fromEntries(
    (Object.keys(PADRON) as (keyof typeof PADRON)[]).map((key, index) => [
      key,
      generatedPadron(index, key, Number(today.slice(0, 4))),
    ]),
  ) as Record<keyof typeof PADRON, ReturnType<typeof generatedPadron>>;
  const padronOf = (key: keyof typeof PADRON) => [
    ...generated[key],
    ...PADRON_SHARED.filter((sh) => sh.also.includes(key)).map((sh) => ({ ...generated[sh.from][sh.index]!, newThisMonth: false })),
  ];
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    // Two upserts: a bulk upsert sends the same columns for every row.
    const shared = BENEFICIARIES.map((b) => ({
        comedor_id: comedorId,
        nombre_completo: b.nombre,
        dni: b.dni,
        categoria: b.categoria,
        subtipo_caso_social: b.subtipo,
        care_group: b.careGroup,
        birth_date: b.birthDate,
        sex: b.sex,
        activo: true,
        carga_familiar: 0,
        vigencia_hasta: b.categoria === "caso_social" ? yearEnd : null,
      }));
    const expired = new Set(
      generated[k.key as keyof typeof PADRON]
        .filter((b) => b.activo && b.categoria === "caso_social")
        .slice(0, alertsOf(k.key).expired)
        .map((b) => b.dni),
    );
    const own = padronOf(k.key as keyof typeof PADRON).map((b) => ({
        comedor_id: comedorId,
        nombre_completo: b.nombre,
        dni: b.dni,
        categoria: b.categoria,
        subtipo_caso_social: b.subtipo,
        care_group: b.careGroup,
        birth_date: b.birthDate,
        sex: b.sex,
        activo: b.activo,
        carga_familiar: b.carga,
        telefono: b.telefono,
        direccion: b.direccion,
        foto_url: b.fotoUrl,
        vigencia_hasta: b.categoria === "caso_social" ? (expired.has(b.dni) ? lapsedOn : yearEnd) : null,
        // Everyone else joined last year, so the yearly G4 only counts this month's entries as new.
        created_at: b.newThisMonth ? `${month.from}T15:00:00Z` : `${Number(today.slice(0, 4)) - 1}-11-15T15:00:00Z`,
      }));
    beneficiaryIds[k.key] = {};
    for (const rows of [shared, own] as Record<string, unknown>[][]) {
      const { data: saved, error } = await supabase
        .from("beneficiarios")
        .upsert(rows, { onConflict: "comedor_id,dni" })
        .select("id,dni");
      throwIf(error, `padrón de ${k.nombre}`);
      for (const r of saved ?? []) beneficiaryIds[k.key]![r.dni] = r.id;
    }
  }

  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    const code = kitchenCodes[k.key]!;
    const people = BENEFICIARIES;
    const padronParts = splitServings(Math.round(k.delivered * 0.6), people.length);
    const libreParts = splitServings(k.delivered - padronParts.reduce((s, n) => s + n, 0), 3);

    for (const fecha of days) {
      const { data: menu, error: menuErr } = await supabase
        .from("menus")
        .insert({
          comedor_id: comedorId,
          fecha,
          publicado: true,
          nombre_plato: dishFor(k.key, fecha),
          descripcion: "g1-demo",
          precio: 5,
          raciones_disponibles: k.prepared,
        })
        .select("id")
        .single();
      throwIf(menuErr, `menú ${k.nombre} ${fecha}`);

      const rows: {
        menu_id: string;
        comedor_id: string;
        cantidad: number;
        estado: "recogida" | "pendiente" | "no_recogida";
        codigo: string;
        dni: string | null;
        beneficiario_id: string | null;
        nombre_comensal: string | null;
      }[] = [];

      people.forEach((b, i) => {
        const cantidad = padronParts[i] ?? 0;
        if (!cantidad) return;
        rows.push({
          menu_id: menu!.id,
          comedor_id: comedorId,
          cantidad,
          estado: "recogida",
          codigo: `E${code}-${suffix(codeSeq++)}`,
          dni: b.dni,
          beneficiario_id: beneficiaryIds[k.key]![b.dni]!,
          nombre_comensal: b.nombre,
        });
      });

      libreParts.forEach((cantidad, i) => {
        rows.push({
          menu_id: menu!.id,
          comedor_id: comedorId,
          cantidad,
          estado: "recogida",
          codigo: `L${code}-${suffix(codeSeq++)}`,
          dni: `88882${String(100 + i).slice(-3)}`,
          beneficiario_id: null,
          nombre_comensal: `Comensal libre ${i + 1}`,
        });
      });

      const leftover = k.prepared - k.delivered;
      if (leftover > 0) {
        rows.push({
          menu_id: menu!.id,
          comedor_id: comedorId,
          cantidad: leftover,
          // Past days are already settled; only today's and later reservations are still pending (G6).
          estado: fecha < today ? "no_recogida" : "pendiente",
          codigo: `L${code}-${suffix(codeSeq++)}`,
          dni: null,
          beneficiario_id: null,
          nombre_comensal: "Reserva no recogida",
        });
      }

      const { error: resErr } = await supabase.from("reservas").insert(rows);
      throwIf(resErr, `reservas ${k.nombre} ${fecha}`);
    }
  }

  // G3: Monday–Saturday menus since the baseline start, one lumped pickup per day. In this month part of
  // it goes to padrón people one serving each (G4 uso del padrón); the daily total stays the same.
  const historyDays = serviceDays.filter((d) => d < week.from);
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    const code = kitchenCodes[k.key]!;
    const { data: rows, error: histErr } = await supabase
      .from("menus")
      .insert(
        historyDays.filter((fecha) => !lastWeekDay(k.key, "noMenuDays", fecha)).map((fecha) => ({
          comedor_id: comedorId,
          fecha,
          publicado: true,
          nombre_plato: dishFor(k.key, fecha),
          descripcion: "g1-demo",
          precio: 5,
          // The reservas trigger subtracts each pickup, leaving prepared − delivered.
          raciones_disponibles: k.prepared,
        })),
      )
      .select("id,fecha");
    throwIf(histErr, `menús anteriores ${k.nombre}`);
    const users = padronOf(k.key as keyof typeof PADRON).filter((b) => b.activo && b.picksUp);
    const pickupRows = (rows ?? []).flatMap((m) => {
      const dayIndex = historyDays.indexOf(m.fecha);
      const fecha = m.fecha;
      // Each user comes about every third day.
      const named = fecha >= month.from ? users.filter((_, j) => (j + dayIndex) % 3 === 0) : [];
      const lumped = k.delivered - named.length;
      return [
        ...named.map((b) => ({
          menu_id: m.id,
          comedor_id: comedorId,
          cantidad: 1,
          estado: "recogida" as const,
          codigo: `E${code}-${suffix(codeSeq++)}`,
          dni: b.dni,
          beneficiario_id: beneficiaryIds[k.key]![b.dni] ?? null,
          nombre_comensal: b.nombre,
        })),
        // reservas.cantidad is capped at 50, so the day's lumped pickups go in parts.
        ...splitServings(lumped, Math.ceil(lumped / 50)).map((cantidad) => ({
          menu_id: m.id,
          comedor_id: comedorId,
          cantidad,
          estado: "recogida" as const,
          codigo: `L${code}-${suffix(codeSeq++)}`,
          dni: null,
          beneficiario_id: null,
          nombre_comensal: "Entregas del día",
        })),
      ];
    });
    // G6: last week's unconfirmed pickups, one serving each, spread over its menus.
    const lastWeekMenus = (rows ?? []).filter((m) => m.fecha >= lastWeek.from && m.fecha <= lastWeek.to);
    const pendingRows = Array.from({ length: alertsOf(k.key).pending }, (_, i) => ({
      menu_id: lastWeekMenus[i % lastWeekMenus.length]!.id,
      comedor_id: comedorId,
      cantidad: 1,
      estado: "pendiente" as const,
      codigo: `L${code}-${suffix(codeSeq++)}`,
      dni: null,
      beneficiario_id: null,
      nombre_comensal: "Entrega sin confirmar",
    }));
    const { error: histResErr } = await supabase.from("reservas").insert([...pickupRows, ...pendingRows]);
    throwIf(histResErr, `reservas anteriores ${k.nombre}`);
  }

  // G2 + G3: outflows on every service day since the baseline start. This month uses dailyUse, so
  // G2 lands on SUPPLY_DAYS; earlier months use USAGE_BEFORE of it, which G3 shows as merma.
  const supplyDates = serviceDays.filter((d) => d <= today);
  const { error: delSuppliesErr } = await supabase.from("insumos").delete().in("comedor_id", seededIds);
  throwIf(delSuppliesErr, "borrar insumos demo");
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    const coverage = SUPPLY_DAYS[k.key as keyof typeof SUPPLY_DAYS];
    for (const s of SUPPLIES) {
      const days = coverage[s.key];
      const { data: insumo, error: insErr } = await supabase
        .from("insumos")
        .insert({
          comedor_id: comedorId,
          nombre: s.nombre,
          unidad: s.unidad,
          stock_actual: s.dailyUse * days,
          consumo_diario_promedio: 0,
          precio_referencial: s.precio,
          origen: "comprado",
        })
        .select("id")
        .single();
      throwIf(insErr, `insumo ${s.nombre} en ${k.nombre}`);
      const { error: movErr } = await supabase.from("movimientos_insumo").insert([
        {
          insumo_id: insumo!.id,
          tipo: "ingreso",
          cantidad: s.dailyUse * supplyDates.length,
          fecha: supplyDates[0],
          nota: "Compra · g1-demo",
          precio_unitario: s.precio,
        },
        ...supplyDates.map((fecha) => ({
          insumo_id: insumo!.id,
          tipo: "salida" as const,
          cantidad:
            fecha >= month.from
              ? s.dailyUse
              : Math.round(s.dailyUse * USAGE_BEFORE[k.key as keyof typeof USAGE_BEFORE] * 100) / 100,
          fecha,
          nota: "g1-demo",
        })),
      ]);
      throwIf(movErr, `movimientos ${s.nombre} en ${k.nombre}`);
    }
  }

  // G6: one cash day per service day up to today, closed except today's and last week's open ones.
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const rows = serviceDays
      .filter((d) => d <= today)
      .map((fecha) => {
        const sales = lastWeekDay(k.key, "noMenuDays", fecha) ? 0 : k.delivered * 5;
        return {
          comedor_id: kitchenIds[k.key]!,
          fecha,
          cerrado: fecha < today && !lastWeekDay(k.key, "openCashDays", fecha),
          total_ingresos: sales,
          total_egresos: 0,
          ganancia: sales,
        };
      });
    const { error: cashErr } = await supabase.from("caja_dias").upsert(rows, { onConflict: "comedor_id,fecha" });
    throwIf(cashErr, `caja ${k.nombre}`);
  }

  // G5: cronograma since the history start. Each kitchen staffs its shifts from its own padrón and skips
  // days per SHIFT_COVERAGE; Villa Hermosa has none, so it shows as "Sin datos".
  const { error: delShiftsErr } = await supabase
    .from("cronograma")
    .delete()
    .in("comedor_id", allKitchenIds)
    .gte("fecha", historyStart)
    .lte("fecha", week.to);
  throwIf(delShiftsErr, "borrar cronograma demo");
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const key = k.key as keyof typeof PADRON;
    const pool = generated[key].filter((b) => b.activo).slice(0, 12).map((b) => b.nombre);
    const rows = serviceDays.flatMap((fecha, dayIndex) => {
      if (!within(dayIndex + 1, 37, SHIFT_COVERAGE[key])) return [];
      const size = 4 + (dayIndex % 3);
      const socias = [...new Set(Array.from({ length: size }, (_, j) => pool[(dayIndex * size + j) % pool.length]!))];
      return [{ comedor_id: kitchenIds[k.key]!, fecha, socias, directiva_de_turno: null, notas: "g1-demo" }];
    });
    const { error: shiftErr } = await supabase.from("cronograma").insert(rows);
    throwIf(shiftErr, `cronograma ${k.nombre}`);
  }

  const { data: authPage, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  throwIf(listErr, "listar usuarios");
  const users = authPage?.users ?? [];

  for (const s of SUPERVISORS) {
    const assigned = s.kitchenKeys.map((key) => kitchenIds[key]!);
    let user = users.find((u) => (u.email ?? "").toLowerCase() === s.email);
    if (!user) {
      const created = await supabase.auth.admin.createUser({
        email: s.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: s.name, dni: s.dni, phone: s.phone },
      });
      throwIf(created.error, `crear cuenta ${s.email}`);
      user = created.data.user!;
    } else {
      const updated = await supabase.auth.admin.updateUserById(user.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: s.name, dni: s.dni, phone: s.phone },
      });
      throwIf(updated.error, `actualizar cuenta ${s.email}`);
    }

    const { error: roleErr } = await supabase.from("user_roles").upsert(
      { user_id: user.id, role: "supervisor" },
      { onConflict: "user_id,role" },
    );
    throwIf(roleErr, `rol supervisor ${s.email}`);

    const { error: profileErr } = await supabase.from("supervisors").upsert({
      user_id: user.id,
      name: s.name,
      access_level: s.accessLevel,
      dni: s.dni,
      phone: s.phone,
    });
    throwIf(profileErr, `perfil supervisor ${s.email}`);

    const { error: clearErr } = await supabase.from("supervisor_assignments").delete().eq("user_id", user.id);
    throwIf(clearErr, `limpiar asignaciones ${s.email}`);
    const { error: assignErr } = await supabase.from("supervisor_assignments").insert(
      assigned.map((comedor_id) => ({ user_id: user.id, comedor_id })),
    );
    throwIf(assignErr, `asignar ollas ${s.email}`);
  }

  const kitchenStaff = [
    ...G1_DEMO_KITCHEN_STAFF.map((st) => ({ ...st, sex: "female" as Sex })),
    ...BOARD_STAFF,
  ];
  for (const staff of kitchenStaff) {
    const comedorId = kitchenIds[staff.kitchenKey];
    if (!comedorId) throw new Error(`Falta olla ${staff.kitchenKey}`);
    const email = emailDeDni(staff.dni);
    const password = claveDePin(staff.dni, G1_DEMO_PIN);
    let user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) {
      const created = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: staff.nombre, dni: staff.dni, phone: staff.telefono },
      });
      throwIf(created.error, `crear gestora ${staff.dni}`);
      user = created.data.user!;
      users.push(user);
    } else {
      const updated = await supabase.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { name: staff.nombre, dni: staff.dni, phone: staff.telefono },
      });
      throwIf(updated.error, `actualizar gestora ${staff.dni}`);
    }

    const { data: member, error: memberFindErr } = await supabase
      .from("usuarios_comedor")
      .select("id")
      .eq("comedor_id", comedorId)
      .eq("user_id", user.id)
      .maybeSingle();
    throwIf(memberFindErr, `buscar gestora ${staff.dni}`);
    if (member) {
      const { error: updErr } = await supabase
        .from("usuarios_comedor")
        .update({
          nombre: staff.nombre,
          cargo: staff.cargo,
          dni: staff.dni,
          telefono: staff.telefono,
        })
        .eq("id", member.id);
      throwIf(updErr, `actualizar vínculo ${staff.dni}`);
    } else {
      const { error: insErr } = await supabase.from("usuarios_comedor").insert({
        user_id: user.id,
        comedor_id: comedorId,
        nombre: staff.nombre,
        cargo: staff.cargo,
        dni: staff.dni,
        telefono: staff.telefono,
      });
      throwIf(insErr, `vincular gestora ${staff.dni}`);
    }

    const padron = staffToPadronRow({
      comedor_id: comedorId,
      nombre: staff.nombre,
      dni: staff.dni,
      telefono: staff.telefono,
    });
    const { data: existingPadron, error: padFindErr } = await supabase
      .from("beneficiarios")
      .select("id")
      .eq("comedor_id", comedorId)
      .eq("dni", staff.dni)
      .maybeSingle();
    throwIf(padFindErr, `buscar padrón gestora ${staff.dni}`);
    if (!existingPadron) {
      const { error: padErr } = await supabase.from("beneficiarios").insert({ ...padron, sex: staff.sex });
      throwIf(padErr, `padrón gestora ${staff.dni}`);
    } else {
      const { error: sexErr } = await supabase.from("beneficiarios").update({ sex: staff.sex }).eq("id", existingPadron.id);
      throwIf(sexErr, `sexo gestora ${staff.dni}`);
    }
  }

  console.log("\nDemo G1 a G6 listo en el Supabase de .env.local\n");
  console.log(`Grupo:   ${GROUP_NAME}`);
  console.log(`Semana:  ${week.label} (${week.from} a ${week.to})`);
  console.log(`G6:      semana anterior ${lastWeek.label} con alertas de menú, caja y entregas`);
  console.log("Ollas:   " + KITCHENS.map((k) => k.nombre.replace(PREFIX, "")).join(", "));
  console.log("\nSupervisoras — /auth con correo, luego /admin/reportes:\n");
  for (const s of SUPERVISORS) {
    const ollas = s.kitchenKeys.length === KITCHENS.length ? "las 5 ollas" : "3 ollas (Carmen, Cristo Rey, Santa María)";
    console.log(`  ${s.name}  (${s.accessLevel}, ${ollas})`);
    console.log(`    correo  ${s.email}`);
    console.log(`    clave   ${DEMO_PASSWORD}\n`);
  }
  console.log("Gestoras — /auth con DNI + PIN, luego /panel:\n");
  for (const staff of kitchenStaff) {
    const kitchen = KITCHENS.find((k) => k.key === staff.kitchenKey)!;
    console.log(`  ${kitchen.nombre.replace(PREFIX, "")}  (${kitchenCodes[staff.kitchenKey]})`);
    console.log(`    ${staff.cargo.padEnd(8)} ${staff.nombre}`);
    console.log(`    DNI      ${staff.dni}`);
    console.log(`    PIN      ${G1_DEMO_PIN}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
