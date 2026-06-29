# Club SaaS

Monorepo for multi-tenant sports club management.

| Package | Description |
|---------|-------------|
| `backend` | Club API (tenant DBs, Mercado Pago, auth) |
| `super` | Super-admin / tenant registry |
| `frontend` | Expo mobile app |
| `superfront` | Super-admin web UI (Vite) |

## Deploy

| Package | Host |
|---------|------|
| `super`, `backend` | [Render](https://render.com) (`render.yaml`) |
| `frontend` | [Vercel](https://vercel.com) (`frontend/vercel.json`) |
| `superfront` | Local (`npm run dev` in `superfront/`) |

See [DEPLOY.md](./DEPLOY.md) for env vars and Mercado Pago OAuth setup.

## Local dev

```bash
npm install
npm run dev --workspace=super
npm run dev --workspace=backend
cd frontend && npx expo start
```

Copy `.env.example` files to `.env` in each service before running.
