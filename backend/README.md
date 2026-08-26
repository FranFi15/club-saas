# Club Backend

Express API for Hermes Club — multi-tenant sports club management. Each club has its own MongoDB database; tenants are resolved via `x-club-identifier` against the **super** registry.

Deployed on [Render](https://render.com). See the repo root [`DEPLOY.md`](../DEPLOY.md) for production env vars and Mercado Pago OAuth.

## Stack

- **Node.js** (ES modules) + **Express 5**
- **Mongoose 9** — one connection pool / models per tenant DB
- **JWT** auth (`Bearer`) + role authorization
- **Mercado Pago** — OAuth per club + webhooks
- **Cloudinary** — media uploads
- **Sentry** (optional) — error tracking
- **node-cron** — sessions, cuotas, overdue, reminders

## Quick start

```bash
# from monorepo root
npm install
cp backend/.env.example backend/.env
# fill JWT_*, SUPER_ADMIN_URL, INTERNAL_ADMIN_API_KEY, etc.

npm run dev --workspace=backend
# or
cd backend && npm run dev
```

Default port: `5000` (`PORT` in `.env`).

Health checks (no tenant header): `GET /`, `GET /health`, `GET /healthz` → `ok`.

Requires the **super** service running so tenant resolution can look up club connection strings.

## Multi-tenancy

Almost every `/api/*` route runs through `resolveTenant`:

1. Read club id from `x-club-identifier` (or `?club=`).
2. Ask Super Admin for that club’s Mongo connection string (cached).
3. Attach `req.tenantDB`, `req.models`, `req.clubIdentifier`.

Special cases without the header:

| Case | How tenant is resolved |
|------|------------------------|
| Mercado Pago OAuth callback | Signed `state` payload |
| Mercado Pago webhooks | Seller `user_id` → club mapping |

JWT payloads include the club id; `protect` rejects tokens used against a different tenant.

### Required request headers (app clients)

```http
Authorization: Bearer <access_token>
x-club-identifier: <urlIdentifier>
```

## Auth & roles

| Middleware | Role |
|------------|------|
| `protect` | Valid JWT + active user in the tenant DB |
| `authorize(...roles)` | User `rol` must be in the list |

Assignable roles:

`admin_club`, `administrativo`, `control_ingreso`, `colaborador`, `profe`, `preparador_fisico`, `nutricionista`, `psicologo`, `atleta`, `tutor`

(`medico` / `kinesiologo` are deprecated legacy values.)

## API surface

All under `/api` (rate-limited). Tenant middleware applied per mount.

| Mount | Domain |
|-------|--------|
| `/api/auth` | Login, refresh, session |
| `/api/users` | Users, profile, push tokens |
| `/api/disciplines` | Disciplines |
| `/api/categories` | Categories, staff assignment, chat toggles |
| `/api/schedules` | Weekly grids |
| `/api/enrollments` | Athlete enrollments |
| `/api/enrollment-requests` | Join requests |
| `/api/family-invites` | Family signup invites |
| `/api/sessions` | Sessions / attendance |
| `/api/session-swaps` | Session swap requests |
| `/api/spaces` | Spaces |
| `/api/rentals` | Facility rentals |
| `/api/financial` | Plans, cuotas, nómina, gastos, receipts |
| `/api/mercadopago` | OAuth, preferences, webhooks |
| `/api/news` | Club news |
| `/api/resources` | Shared materials |
| `/api/requirements` | Document requirements / submissions |
| `/api/performance` | Metrics, measurements, nutrition settings |
| `/api/wellness` | Wellness check-ins |
| `/api/training` | Training plans |
| `/api/medical` | Injuries / appointments |
| `/api/notifications` | In-app notifications |
| `/api/badges` | Tab / hub badge counts |
| `/api/chat` | DMs, category groups, staff group |
| `/api/inbox` | Pending inbox items |
| `/api/club-entry` | Entry QR scan, visitors, history |
| `/api/upload` | Cloudinary uploads |
| `/api/stats` | Admin dashboard stats |

Internal (shared secret with Super):

- `POST /api/internal/mp-seller-backfill` — refresh MP seller → club map

## Folder layout

```
backend/
├── index.js                 # App bootstrap, middleware, route mounts, crons
├── instrument.js            # Sentry init (before other imports)
├── .env.example
└── src/
    ├── config/              # DB, Cloudinary, Sentry
    ├── constants/           # Roles, etc.
    ├── controllers/
    ├── cron/                # Session / payment / overdue / reminder jobs
    ├── middlewares/         # tenant, auth, errors
    ├── models/              # Per-tenant Mongoose schemas (factory per DB)
    ├── routes/
    ├── scripts/             # Seeds & MP OAuth helpers
    ├── services/            # Business logic
    └── utils/
```

Models are registered per tenant via `getTenantModels(tenantDB)` — never share documents across clubs.

## Environment

Copy `.env.example` → `.env`. Important groups:

| Area | Variables |
|------|-----------|
| Core | `PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLUB_ENTRY_TOKEN_SECRET` |
| Super | `SUPER_ADMIN_URL`, `INTERNAL_ADMIN_API_KEY` |
| Public URLs | `PUBLIC_API_URL` / `BACKEND_URL`, `FRONTEND_URL`, `MARKETING_SITE_URL` |
| Mercado Pago | `MERCADOPAGO_CLIENT_ID/SECRET`, `MERCADOPAGO_OAUTH_REDIRECT_URI`, `MP_OAUTH_STATE_SECRET`, `MP_WEBHOOK_SECRET` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Crons | `ENABLE_*_CRON`, `*_CRON_SCHEDULE`, optional `*_CRON_RUN_ON_START` |
| Sentry | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` |

Production refuses to start without `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `FRONTEND_URL`.

Helpers:

```bash
npm run mp:oauth-secret   # generate MP_OAUTH_STATE_SECRET
npm run mp:check-oauth    # validate OAuth-related env
```

## Crons

Enabled via env flags (need Super URL + internal API key to iterate clubs):

| Flag | Default schedule | Purpose |
|------|------------------|---------|
| `ENABLE_SESSION_CRON` | `0 3 * * *` | Generate future sessions from schedules |
| `ENABLE_PAYMENT_CRON` | `0 6 1 * *` | Generate monthly cuotas |
| `ENABLE_OVERDUE_CRON` | `0 4 * * *` | Mark overdue payments |
| `ENABLE_PAYMENT_REMINDER_CRON` | `0 10 * * *` | Cuota reminders |

## Seed scripts

Run from `backend/` with a valid `.env` (and usually a target club identifier as script args — see each file):

```bash
npm run seed:ejemplo    # example club data
npm run seed:demo       # demo flow
npm run seed:finanzas   # finance samples
npm run seed:nutri      # nutrition metrics samples
```

## Security notes

- Helmet, CORS (allowlist from `FRONTEND_URL` + marketing site), rate limits on `/api`, login, and uploads
- `express-mongo-sanitize` on request data
- JSON body limit `10kb` (uploads go through dedicated upload routes)
- MP webhooks verified with `MP_WEBHOOK_SECRET` when configured

## Scripts (package.json)

| Script | Command |
|--------|---------|
| `dev` | `nodemon index.js` |
| `start` | `node index.js` |
| `seed:*` | Demo / example / finanzas / nutri seeders |
| `mp:oauth-secret` | Generate OAuth state secret |
| `mp:check-oauth` | Check MP OAuth env |

## Related docs

- [`../README.md`](../README.md) — monorepo overview
- [`../DEPLOY.md`](../DEPLOY.md) — Render / Vercel / Mercado Pago
- [`../MOBILE.md`](../MOBILE.md) — EAS builds (clients that call this API)
- [`.github/workflows/smoke-ci.yml`](../.github/workflows/smoke-ci.yml) — install + `/health` smoke on push/PR to `main`
