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

## Almacén (G2)

El seeder también carga el almacén de Virgen del Carmen, Cristo Rey, Santa María y Las Flores: seis insumos (arroz, aceite, azúcar, fideos, menestras y leche evaporada) con dos semanas de salidas diarias. Cada vez que corre, borra y vuelve a crear los insumos de esas cuatro ollas.

Los días de cobertura quedan fijos (`SUPPLY_DAYS` en el script). Cristo Rey, Santa María y Las Flores tienen insumos por debajo de 4 días, así que salen en alerta en `/admin/reportes` → **G2 · Almacén del grupo**. Villa Hermosa sigue sin movimientos.

## Rendimiento de insumos (G3)

El G3 es mensual. El seeder crea menús de lunes a sábado desde tres meses antes del mes actual, con una entrega agrupada por día fuera de la semana actual. También crea salidas de almacén en cada día de atención.

- **Platos:** cada olla rota su propia lista (`DISH_ROTATION`). Cristo Rey tiene poca variedad, y Las Flores repite cada plato 3 días seguidos.
- **Merma:** en los meses anteriores las ollas usaron una fracción de lo que usan este mes (`USAGE_BEFORE`). Por eso Cristo Rey y Las Flores muestran merma frente a su propio promedio.

Mira el reporte en `/admin/reportes` → **G3 · Rendimiento de insumos del grupo**, con el selector de mes.

## Padrón del grupo (G4)

El G4 se ve por mes o por año. Cuenta a cada persona una sola vez aunque esté en varios padrones, y nunca muestra nombres ni DNI.

El seeder arma el padrón de las cuatro ollas sembradas:

- **Personas:** los 6 beneficiarios de siempre, más un padrón generado por olla (`PADRON`) con DNI `8889xxxx`. Cada persona tiene grupo de atención (adulto mayor, niña o niño, caso social, discapacidad, gestante o lactante) y fecha de nacimiento. Unas pocas quedan sin grupo y salen como "Sin clasificar".
- **Completitud:** cada olla tiene distinta proporción de teléfono, dirección y foto. Cristo Rey queda por debajo del 50% de teléfonos y sale en rojo.
- **Uso:** en el mes actual, parte de las entregas del día se registra a nombre de personas del padrón. Una parte de cada olla nunca recoge (`unused`), y esas personas son los "inactivos de hecho".
- **Más de un padrón:** algunas personas generadas también están en otra olla (`PADRON_SHARED`).
- **Altas:** algunas personas tienen fecha de alta en el mes actual.

El padrón se guarda con upsert por olla y DNI, así que correr el seeder de nuevo no duplica personas.

Mira el reporte en `/admin/reportes` → **G4 · Padrón del grupo**, con el selector Mes/Año.

## Equipo y turnos (G5)

El G5 es mensual y no muestra nombres de socias. Las horas se calculan con 5 h por socia en cada turno (`G5_HOURS_PER_SHIFT`). Se valorizan a S/ 5.43 por hora, que es la remuneración mínima entre 208 h (`G5_HOURLY_VALUE`).

El seeder deja:

- **Días de atención:** las cinco ollas atienden de lunes a sábado, igual que los menús sembrados.
- **Directiva:** cada olla tiene su presidenta. `BOARD_STAFF` suma tesoreras y almaceneras, todas con DNI y PIN 1234. Cristo Rey y Las Flores no tienen almacenera y Santa María no tiene tesorera. La tesorera de Cristo Rey es hombre, así que "Mujeres en cargos directivos" no llega al 100%.
- **Sexo:** se registra en el padrón (campo nuevo). Lo tienen los beneficiarios de siempre, el padrón generado y la directiva.
- **Cronograma:** turnos de 4 a 6 socias del padrón de cada olla. Carmen cubre todos los días; Cristo Rey, cerca del 64% (sale en rojo); Santa María, el 77%; Las Flores, el 92%. Villa Hermosa no tiene turnos y sale "Sin datos".

Mira el reporte en `/admin/reportes` → **G5 · Equipo y turnos del grupo**, con el selector de mes.

## Alertas del grupo (G6)

El G6 es semanal (lunes a sábado) y sale en hoja apaisada. Si la semana está en curso, corta en el día de hoy. Pone a cada comedor en un semáforo:

- **Atender:** 2 o más días sin menú, cajas sin cerrar o insumos en alerta.
- **Revisar:** cualquier otra alerta.
- **Al día:** todo en cero.
- **Sin datos:** el comedor no registró menús ni cajas en la semana.

Qué cuenta cada columna:

| Columna | Qué cuenta |
|---|---|
| Días sin menú | Días de atención sin menú publicado. |
| Cajas sin cerrar | Días de atención ya pasados con la caja abierta o sin caja. |
| Insumos en alerta | Insumos con menos de 4 días de cobertura, con la misma regla que el G2. |
| Padrón vencido | Personas activas con la vigencia vencida. |
| Registros pendientes | Reservas que siguen en estado pendiente en un día ya pasado. |

El seeder (`WEEK_ALERTS`) deja dos semanas distintas.

**Semana anterior:**

| Comedor | Estado | Por qué |
|---|---|---|
| Cristo Rey | Atender | 2 días sin menú, 2 cajas abiertas, 7 carnés vencidos y 9 entregas sin confirmar |
| Santa María | Revisar | 1 caja abierta, 2 vencidos y 3 pendientes |
| Las Flores | Revisar | 1 caja abierta, 3 vencidos y 2 pendientes |
| Virgen del Carmen | Al día | — |
| Villa Hermosa | Sin datos | — |

**Semana actual:** Cristo Rey, Santa María y Las Flores salen en Atender por sus insumos en alerta (`SUPPLY_DAYS`). Las cajas anteriores a hoy están cerradas. Los sobrantes de los días pasados quedan como `no_recogida`.

Mira el reporte en `/admin/reportes` → **G6 · Alertas del grupo**, con el selector de semana.

## Aliados

Los aliados son organizaciones que apoyan ollas. Un aliado puede apoyar varias ollas y una olla puede tener varios aliados. Se gestionan en `/admin/aliados`, que solo ve el admin.

El seeder (`ALLIES`) crea:

| Aliado | Ollas |
|---|---|
| Red Solidaria Sur | Virgen del Carmen, Cristo Rey, Santa María |
| Fundación Pan Compartido | Cristo Rey, Las Flores |
| Asociación Manos Unidas | Santa María |

Villa Hermosa no tiene aliado.

## Impacto del grupo (G7)

El G7 es mensual y va para aliados: solo muestra totales, sin nombres de comedores ni de personas. Se arma con las ollas del grupo que apoya el aliado elegido, o con todo el grupo.

Reglas:

- **Personas:** se redondean. Una cifra de 1 a 4 se muestra como "<5".
- **Kilos por origen:** suman lo que entró en el mes en kg y en L. Los insumos por unidad no entran.
- **Brecha:** es el día en que se acabó lo municipal en cada olla.

El seeder deja:

- **Municipalidad (PCA):** "Arroz (PCA)", "Menestras (PCA)" y "Aceite (PCA)", sin precio. Llegan el primer día de atención de cada mes. En los meses pasados se acaban el día 18 a 22, según la olla, así que setiembre muestra la brecha. Este mes todavía les quedan 10 días.
- **Donaciones:** "Verduras (donación)", con entregas semanales.
- **Compras:** una compra al mes por insumo comprado.
- **Dependencia:** desde el mes pasado, las personas del padrón recogen cada 1, 2, 3 o 5 días de atención, así que salen los cuatro rangos de días.

Mira el reporte en `/admin/reportes` → **G7 · Impacto del grupo**, con los selectores de aliado y de mes.

## Donación al grupo (G8)

El G8 se arma por lote de donación, no por período. Funciona así:

1. El admin crea el donante en `/admin/donantes`.
2. El admin crea el lote en `/admin/donaciones`, con código (`D-AAAA-NNN`), donante, grupo y fecha.
3. Cada comedor registra su parte en Almacén → Llegó o compré → Donación → Lote de donación.

Hay dos versiones:

- **Donante:** los comedores van con letras.
- **Supervisión:** los comedores van con nombre.

Cómo se calcula:

- **Duración:** se supone que lo donado se usa primero. Cada parte dura hasta que las salidas de ese insumo, desde que llegó, suman lo donado.
- **Raciones:** kilos de cada comedor ÷ su rendimiento. El rendimiento son los kilos usados por ración mientras duró.

El seeder (`DONATION_LOTS`) deja el donante "Alimentos Andinos S.A.C." con dos lotes, los dos ya consumidos:

| Lote | Mes | Comedores | Productos |
|---|---|---|---|
| D-2026-041 | Mes pasado | 4 | Arroz y menestras |
| D-2026-044 | Este mes | 3 | Arroz |

Cada parte entra el mismo día que la compra del mes, y la compra baja en la misma cantidad. Así el stock de G2, G3 y G6 no cambia. En el G7, esos kilos pasan de "Compras" a "Donaciones".

El seeder no pone fotos, así que el reporte muestra los recuadros de "Sin foto".

Mira el reporte en `/admin/reportes` → **G8 · Donación al grupo**, con los selectores de lote y de versión.

## Adopción y calidad de datos (G9)

El G9 es semanal (lunes a sábado), con corte en el día de hoy, y es solo para supervisión.

- **Usuarias activas:** sale de `kitchen_activity`. El panel registra una fila por socia, olla y día la primera vez que la socia lo abre. Supervisoras y admin no cuentan.
- **Cajas sin cuadrar:** cajas cerradas cuyo ingreso guardado difiere en más de S/ 0.50 de la suma de sus transacciones de ingreso.
- **Entregas sin ingreso:** recogidas cuyo código no aparece en ninguna venta de caja ("Entrega CODIGO" o "Reserva CODIGO") y que no tienen deuda.
- **Duplicados:** personas activas del mismo padrón con el mismo nombre, sin contar tildes ni mayúsculas, y DNI distinto.
- **Entregas pendientes:** reservas que siguen pendientes en días ya pasados.
- **Datos completos:** la olla registró menú, caja y almacén en la semana.

El seeder deja:

- **Ventas:** una venta en caja por cada recogida. El ingreso de cada caja es la suma de sus ventas.
- **Problemas de la semana pasada** (`DATA_ISSUES`):

  | Comedor | Cajas sin cuadrar | Entregas sin venta |
  |---|---|---|
  | Cristo Rey | 2 | 6 |
  | Santa María | 1 | 2 |
  | Las Flores | 0 | 1 |

- **Duplicados:** una persona repetida con otro DNI en Cristo Rey y otra en Las Flores.
- **Uso del panel** de las cuentas demo en los últimos 60 días:
  - La presidenta de Villa Hermosa dejó de entrar hace 14 días.
  - La almacenera de Carmen empezó esta semana, así que "Usuarias activas" muestra "+1".

Mira el reporte en `/admin/reportes` → **G9 · Adopción y calidad de datos**, con el selector de semana.
