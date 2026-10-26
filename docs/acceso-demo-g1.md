# Acceso demo G1

Cuentas y ollas que crea [`scripts/seed-g1-demo.ts`](../scripts/seed-g1-demo.ts) en el Supabase de `.env.local`.

Entrá en `/auth`. Para regenerar (idempotente):

```bash
npx tsx scripts/seed-g1-demo.ts
```

Grupo: **VES Sur Demo**. Semana del reporte: lunes a sábado, hora Lima.

## Gestoras de cada olla

En `/auth` poné el **DNI** y el **PIN**. Te lleva al `/panel` de esa olla.

PIN de las cinco: `1234`

| Olla | Código | Gestora | DNI | PIN |
|---|---|---|---|---|
| Virgen del Carmen | `XACUS` | Carmen Quispe | `88883101` | `1234` |
| Cristo Rey | `D2CR2` | Reyna Torres | `88883102` | `1234` |
| Santa María | `D2SM3` | María Santos | `88883103` | `1234` |
| Las Flores | `D2LF4` | Flor Paredes | `88883104` | `1234` |
| Villa Hermosa | `D2VH5` | Hilda Villa | `88883105` | `1234` |

Villa Hermosa no tiene menús de la semana a propósito (olla vacía en el G1).

Virgen del Carmen usa `XACUS` porque `D2VC1` ya estaba ocupado. Si el seeder vuelve a generar un código, usá el de la consola.

## Supervisoras

En `/auth` poné **correo y clave**. Vas a `/admin` (lista de ollas) o `/admin/reportes`. Desde la tarjeta de cada olla, **Entrar al panel** / **Ver olla**.

Clave de las dos: `OllitaDemo1`

| Nombre | Correo | Clave | Acceso | Ollas |
|---|---|---|---|---|
| Rosa Quispe | `rosa.demo@laollita.pe` | `OllitaDemo1` | `full` (puede editar) | las 5 |
| Luis Huamán | `luis.demo@laollita.pe` | `OllitaDemo1` | `view` (solo lectura) | 3 (Carmen, Cristo Rey, Santa María) |

Rosa — DNI `88880001`, celular `999888001`.
Luis — DNI `88880002`, celular `999888002`.
