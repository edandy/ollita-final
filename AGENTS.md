# La Ollita — agent rules

## Code and process

- Variables, function names, database tables, and columns are always in English.
- Every new task or feature starts with TDD: write failing tests first, then implement.
- User-facing UI copy may stay in Spanish.
- Do not rename the existing schema (`comedores`, `usuarios_comedor`, and other legacy Spanish names). English applies to new code and new tables.
- Buttons that persist data (save, create, publish, confirm) lock on the first click: `disabled` plus a loading label until the request finishes. Use `useSubmitLock` (ref-based). React state alone is not enough. UI copy stays in Spanish (`Guardando…` / `Creando…`).
- Form validation and error messages must be user-friendly Spanish. Never show raw Postgres, Supabase Auth, constraint, RLS, or enum text (`invalid input value for enum…`, `duplicate key…`, `row-level security policy…`, `already been registered`). Translate those in a helper (`friendlySupabaseError` in the panel, `friendlyCreateStaffError` / `friendlyCreatePlatformUserError` in admin) and cover it with tests.
- Supervisor with access `view` in `/panel`: hide all create/edit/delete actions in the UI (`PanelCta`, `PanelWriteGate`, `useCanWrite`). Do not rely on RLS errors to block writes the user can still attempt from the UI.

## Platform roles

- `admin`: full access to `/admin` (every kitchen and every section).
- `supervisor`: is **not** a kitchen member (`usuarios_comedor`). They are assigned one or more kitchens. Access level `view` or `full` is **per user**, managed by an admin.
- A user cannot be a supervisor and a kitchen member at the same time.
- After login, admin and supervisor go to `/admin`; a kitchen member goes to `/panel`.
- On `/admin`, a supervisor **only** sees their assigned kitchens. They cannot use Nueva olla, Gestores, Usuarios, Uso diario, or card actions (edit, invite, activate, delete). Hide those in the UI and block them in server functions.
- From that list they enter `/panel` for a kitchen to view (`view`) or manage (`full`), and return to `/admin`.
- Platform user CRUD (admin or supervisor, assign kitchens, `view`/`full`) is **admin only**.
