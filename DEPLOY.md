# Deploy — GitHub + Render (Mercado Pago)

## 1. GitHub

```bash
cd club
git init
git add .
git commit -m "Initial commit: club SaaS monorepo"
```

Create an empty repo on GitHub (e.g. `club-saas`), then:

```bash
git remote add origin https://github.com/TU_USUARIO/club-saas.git
git branch -M main
git push -u origin main
```

Never commit `.env` files (they are gitignored).

## 2. Render — Blueprint

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. Connect the GitHub repo
3. Render reads `render.yaml` and creates **club-super** and **club-backend**

### club-super (port 4000 internally)

| Variable | Example |
|----------|---------|
| `MONGO_URI` | `mongodb+srv://.../superadmin` |
| `MONGO_DB_HOST` | `mongodb+srv://...` (same cluster, no DB name) |
| `INTERNAL_ADMIN_API_KEY` | long random string |
| `JWT_SECRET` | long random string |

Copy the public URL, e.g. `https://club-super.onrender.com`

### club-backend

| Variable | Value |
|----------|--------|
| `SUPER_ADMIN_URL` | `https://club-super.onrender.com` (no trailing slash) |
| `INTERNAL_ADMIN_API_KEY` | **same** as super |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | strong secrets |
| `PUBLIC_API_URL` | `https://club-backend.onrender.com` |
| `BACKEND_URL` | same as `PUBLIC_API_URL` |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | `https://club-backend.onrender.com/api/mercadopago/oauth/callback` |
| `MERCADOPAGO_CLIENT_ID` / `MERCADOPAGO_CLIENT_SECRET` | from MP developers panel |
| `MP_OAUTH_STATE_SECRET` | `npm run mp:oauth-secret --workspace=backend` |
| `CLOUDINARY_*` | your Cloudinary credentials |
| `FRONTEND_URL` | optional; deep link / web return after OAuth |

In [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app), register the **exact** redirect URI above.

### MongoDB Atlas

Allow network access: **0.0.0.0/0** (or Render outbound IPs) so both services can reach Atlas.

## 3. Mobile app — point to Render

Create `frontend/.env` (local, not committed):

```env
EXPO_PUBLIC_CLUB_API_URL=https://club-backend.onrender.com/api
EXPO_PUBLIC_SUPER_API_URL=https://club-super.onrender.com/api
```

Restart Expo after changing env vars.

For local dev, omit these vars — the app falls back to LAN IP / localhost.

## 4. Verify

- `https://club-super.onrender.com/` → Super-Admin message
- `https://club-backend.onrender.com/` → Club backend message
- Admin profile → connect Mercado Pago → OAuth should return to Render callback

**Note:** Free Render services sleep after inactivity; first request may take ~30s.
