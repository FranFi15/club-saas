# Club SaaS

Monorepo for multi-tenant sports club management.

| Package | Description |
|---------|-------------|
| `backend` | Club API (tenant DBs, Mercado Pago, auth) |
| `super` | Super-admin / tenant registry |
| `frontend` | Expo mobile + web ([Vercel](https://vercel.com) @ `app.hermesclubapp.com`) |
| `superfront` | Super-admin web UI (Vite) |

## Deploy

| Package | Host |
|---------|------|
| `super`, `backend` | [Render](https://render.com) (`render.yaml`) |
| `frontend` | [Vercel](https://vercel.com) @ `app.hermesclubapp.com` + [EAS](https://expo.dev/eas) for iOS/Android |
| `superfront` | Local (`npm run dev` in `superfront/`) |

See [DEPLOY.md](./DEPLOY.md) for env vars and Mercado Pago OAuth.  
See [MOBILE.md](./MOBILE.md) for iOS/Android EAS builds and store submission.

## Local dev

```bash
npm install
npm run dev --workspace=super
npm run dev --workspace=backend
cd frontend && npx expo start
```

Copy `.env.example` files to `.env` in each service before running.
