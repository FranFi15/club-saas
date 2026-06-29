# Club SaaS

Monorepo for multi-tenant sports club management.

| Package | Description |
|---------|-------------|
| `backend` | Club API (tenant DBs, Mercado Pago, auth) |
| `super` | Super-admin / tenant registry |
| `frontend` | Expo mobile app |
| `superfront` | Super-admin web UI (Vite) |

## Deploy

See [DEPLOY.md](./DEPLOY.md) for GitHub + Render setup and Mercado Pago OAuth URLs.

## Local dev

```bash
npm install
npm run dev --workspace=super
npm run dev --workspace=backend
cd frontend && npx expo start
```

Copy `.env.example` files to `.env` in each service before running.
