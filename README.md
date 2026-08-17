# La Ollita

App de ollas comunes y comedores (TanStack Start + React + Vite + Supabase).

Sitio público, panel de cada olla (`/panel`) y administración de plataforma (`/admin`). Hay tres tipos de cuenta:

- **Admin:** `/admin` completo (todas las ollas y secciones).
- **Supervisor:** no es integrante de olla. En `/admin` solo ve las ollas que le asignaron; entra al panel con acceso `view` (solo lectura) o `full`.
- **Gestor / socia:** integrante de una olla (`usuarios_comedor`). Tras el login va a `/panel`.

Las reglas de código y roles están en [`AGENTS.md`](AGENTS.md).

## Requisitos

- **Node.js 20 o superior** (varias dependencias no corren en Node 18).
- npm (o bun).
- Un proyecto [Supabase](https://supabase.com) (Auth + Postgres).
- Opcional: bucket de [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) para fotos.
- Opcional: API key de Google Maps (mapa en el home y detalle de olla).

## Levantar el proyecto

```bash
git clone <repo>
cd ollita
npm install
cp .env.example .env.local
```

Completa `.env.local` (no se commitea). Luego:

```bash
npm run dev
```

Abre la URL que imprima Vite (en este proyecto suele ser `http://localhost:8080`).

### Variables de entorno

Copia `.env.example` y añade también las de Supabase (el cliente y el servidor las leen con nombres distintos):

```bash
# Cliente (Vite las inyecta en el browser — nunca pongas secretos aquí)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...          # anon / publishable key
VITE_GOOGLE_MAPS_API_KEY=                     # opcional; Maps JS API + billing + referers

# Servidor (no uses prefijo VITE_)
SUPABASE_URL=https://xxxx.supabase.co         # misma URL
SUPABASE_PUBLISHABLE_KEY=eyJ...               # misma anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # service_role — solo servidor

# DigitalOcean Spaces (subida de fotos, solo servidor)
SPACES_KEY=
SPACES_SECRET=
SPACES_BUCKET=la-ollita
SPACES_REGION=sfo3
SPACES_ENDPOINT=https://sfo3.digitaloceanspaces.com
SPACES_CDN_URL=                               # opcional, URL pública CDN
```

La key de Spaces necesita permiso **Read and Write**. El access key de Maps, si lo usas, debe tener Maps JavaScript API y referers (`localhost` + dominio de Vercel).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Sirve el build localmente |
| `npm test` | Tests (Vitest). Toda funcionalidad nueva empieza por TDD |
| `npm run test:watch` | Tests en watch |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Base de datos (migraciones)

Los SQL viven en [`supabase/migrations/`](supabase/migrations/), ordenados por timestamp. **Hay que aplicarlos en el proyecto Supabase** (el que apunta `.env.local`); si no, faltan tablas, RLS y el rol `supervisor`.

### Opción A — CLI (recomendado)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

El `PROJECT_REF` es el id del proyecto (en `supabase/config.toml` o en la URL `https://<ref>.supabase.co`).

`db push` aplica solo las migraciones que aún no están en remoto, en orden.

### Opción B — SQL Editor

En Supabase Dashboard → **SQL Editor**, ejecuta cada archivo de `supabase/migrations/` **en orden de nombre** (el timestamp del archivo).

Importante: el rol supervisor está en **dos** archivos a propósito. En Postgres no se puede usar un valor nuevo de enum en la misma transacción en la que se añade:

1. `20260817140000_app_role_supervisor.sql` — `ALTER TYPE app_role ADD VALUE 'supervisor'`
2. `20260817140001_supervisors.sql` — tablas `supervisors` / `supervisor_assignments`, triggers y RLS

Si el segundo falla, confirma que el primero ya corrió y vuelve a lanzar solo el segundo.

Otras migraciones recientes que también hay que tener aplicadas:

- `20260813210000_precio_menu_publico.sql` — precio al público en el perfil del comedor
- `20260812230000_storage_fotos_bucket_policies.sql` — bucket `fotos` (si aún usas Storage de Supabase para algo; las fotos de la app van a Spaces)

### Tipos de TypeScript

Tras cambiar el esquema, regenera [`src/integrations/supabase/types.ts`](src/integrations/supabase/types.ts):

```bash
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

O, sin link:

```bash
npx supabase gen types typescript --project-id <PROJECT_REF> > src/integrations/supabase/types.ts
```

## Auth y primer admin

- **Socias / gestores** entran con DNI + PIN (el backend arma un correo técnico).
- **Admin y supervisores** pueden entrar con correo y contraseña en `/auth`.
- El primer admin de plataforma se asigna en `user_roles` (`role = 'admin'`), hoy vía migración/trigger por email o inserción con `service_role`. Los admins y supervisores se crean desde `/admin/usuarios`.

## Build y deploy

```bash
npm run build
```

El build usa Nitro (target Cloudflare por defecto en la config de Lovable). En Vercel, configura las mismas variables que en `.env.local` **sin** commitear secretos. Tras un deploy, aplica migraciones pendientes en el mismo proyecto Supabase de producción.
