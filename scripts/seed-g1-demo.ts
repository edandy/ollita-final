import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "../src/lib/dates";
import { emailDeDni, claveDePin } from "../src/lib/dni-cuenta";
import { G1_DEMO_KITCHEN_STAFF, G1_DEMO_PIN } from "../src/lib/g1-demo";
import { weekRangeMonSat } from "../src/lib/g1";
import { baselineRange, monthRange } from "../src/lib/g3";
import { staffToPadronRow } from "../src/lib/padron";
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

const BENEFICIARIES: {
  dni: string;
  nombre: string;
  categoria: "socia_familia" | "publico_recurrente" | "caso_social";
  subtipo: "adulto_mayor" | "madre_soltera" | "otro" | null;
}[] = [
  { dni: SHARED_DNI, nombre: "Elena Ramos", categoria: "socia_familia", subtipo: null },
  { dni: "88881112", nombre: "Pedro Vargas", categoria: "caso_social", subtipo: "adulto_mayor" },
  { dni: "88881113", nombre: "Juana Díaz", categoria: "caso_social", subtipo: "madre_soltera" },
  { dni: "88881114", nombre: "Mario Soto", categoria: "caso_social", subtipo: "otro" },
  { dni: "88881115", nombre: "Ana Paredes", categoria: "publico_recurrente", subtipo: null },
  { dni: "88881116", nombre: "Rosa Mendoza", categoria: "socia_familia", subtipo: null },
];

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

  const seededIds = KITCHENS.filter((k) => k.seed).map((k) => kitchenIds[k.key]!);
  const { error: delMenusErr } = await supabase
    .from("menus")
    .delete()
    .in("comedor_id", seededIds)
    .gte("fecha", historyStart)
    .lte("fecha", week.to);
  throwIf(delMenusErr, "borrar menús demo");

  const beneficiaryIds: Record<string, Record<string, string>> = {};
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    beneficiaryIds[k.key] = {};
    for (const b of BENEFICIARIES) {
      const { data: found, error: bFindErr } = await supabase
        .from("beneficiarios")
        .select("id")
        .eq("comedor_id", comedorId)
        .eq("dni", b.dni)
        .maybeSingle();
      throwIf(bFindErr, `buscar padrón ${b.dni} en ${k.nombre}`);
      if (found) {
        beneficiaryIds[k.key]![b.dni] = found.id;
        continue;
      }
      const { data: row, error } = await supabase
        .from("beneficiarios")
        .insert({
          comedor_id: comedorId,
          nombre_completo: b.nombre,
          dni: b.dni,
          categoria: b.categoria,
          subtipo_caso_social: b.subtipo,
          activo: true,
          carga_familiar: 0,
        })
        .select("id")
        .single();
      throwIf(error, `crear padrón ${b.dni} en ${k.nombre}`);
      beneficiaryIds[k.key]![b.dni] = row!.id;
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
        estado: "recogida" | "pendiente";
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
          estado: "pendiente",
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

  // G3: Monday–Saturday menus since the baseline start, one lumped pickup per day.
  const historyDays = serviceDays.filter((d) => d < week.from);
  for (const k of KITCHENS.filter((x) => x.seed)) {
    const comedorId = kitchenIds[k.key]!;
    const code = kitchenCodes[k.key]!;
    const { data: rows, error: histErr } = await supabase
      .from("menus")
      .insert(
        historyDays.map((fecha) => ({
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
      .select("id");
    throwIf(histErr, `menús anteriores ${k.nombre}`);
    const { error: histResErr } = await supabase.from("reservas").insert(
      // reservas.cantidad is capped at 50, so the day's pickups go in parts.
      (rows ?? []).flatMap((m) =>
        splitServings(k.delivered, Math.ceil(k.delivered / 50)).map((cantidad) => ({
          menu_id: m.id,
          comedor_id: comedorId,
          cantidad,
          estado: "recogida" as const,
          codigo: `L${code}-${suffix(codeSeq++)}`,
          dni: null,
          beneficiario_id: null,
          nombre_comensal: "Entregas del día",
        })),
      ),
    );
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

  for (const staff of G1_DEMO_KITCHEN_STAFF) {
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
      const { error: padErr } = await supabase.from("beneficiarios").insert(padron);
      throwIf(padErr, `padrón gestora ${staff.dni}`);
    }
  }

  console.log("\nDemo G1, G2 y G3 listo en el Supabase de .env.local\n");
  console.log(`Grupo:   ${GROUP_NAME}`);
  console.log(`Semana:  ${week.label} (${week.from} a ${week.to})`);
  console.log("Ollas:   " + KITCHENS.map((k) => k.nombre.replace(PREFIX, "")).join(", "));
  console.log("\nSupervisoras — /auth con correo, luego /admin/reportes:\n");
  for (const s of SUPERVISORS) {
    const ollas = s.kitchenKeys.length === KITCHENS.length ? "las 5 ollas" : "3 ollas (Carmen, Cristo Rey, Santa María)";
    console.log(`  ${s.name}  (${s.accessLevel}, ${ollas})`);
    console.log(`    correo  ${s.email}`);
    console.log(`    clave   ${DEMO_PASSWORD}\n`);
  }
  console.log("Gestoras — /auth con DNI + PIN, luego /panel:\n");
  for (const staff of G1_DEMO_KITCHEN_STAFF) {
    const kitchen = KITCHENS.find((k) => k.key === staff.kitchenKey)!;
    console.log(`  ${kitchen.nombre.replace(PREFIX, "")}  (${kitchenCodes[staff.kitchenKey]})`);
    console.log(`    gestora  ${staff.nombre}`);
    console.log(`    DNI      ${staff.dni}`);
    console.log(`    PIN      ${G1_DEMO_PIN}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
