# Deploy — GitHub + Render + Vercel

| Package | Host | Notes |
|---------|------|--------|
| `super` | **Render** | Tenant registry API |
| `backend` | **Render** | Club API + Mercado Pago OAuth |
| `frontend` | **Vercel** | Expo web build |
| `superfront` | **Local** | Super-admin UI (`npm run dev`) |

Native mobile (Expo Go / APK) uses the same `EXPO_PUBLIC_*` URLs as the Vercel web app.

---

## 1. GitHub

Repo: `https://github.com/FranFi15/club-saas` (or your fork).

```bash
git config --global --add safe.directory "C:/Users/Prueba/Documents/Dev/club"
cd club
git push -u origin main
```

Never commit `.env` files.

---

## 2. Render — `super` + `backend`

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. Connect the GitHub repo → Render reads `render.yaml`

### club-super

| Variable | Example |
|----------|---------|
| `MONGO_URI` | `mongodb+srv://.../superadmin` |
| `MONGO_DB_HOST` | `mongodb+srv://...` (no DB name) |
| `INTERNAL_ADMIN_API_KEY` | long random string |
| `JWT_SECRET` | long random string |

Public URL: `https://club-super-xxxx.onrender.com`

### club-backend

| Variable | Value |
|----------|--------|
| `SUPER_ADMIN_URL` | `https://club-super-xxxx.onrender.com` |
| `INTERNAL_ADMIN_API_KEY` | same as super |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | strong secrets |
| `PUBLIC_API_URL` | `https://club-backend-xxxx.onrender.com` |
| `BACKEND_URL` | same as `PUBLIC_API_URL` |
| `FRONTEND_URL` | Exact Vercel URL, e.g. `https://club-saas-backend.vercel.app` (no trailing slash). Comma-separated for preview URLs. |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | `https://club-backend-xxxx.onrender.com/api/mercadopago/oauth/callback` |
| `MERCADOPAGO_CLIENT_ID` / `MERCADOPAGO_CLIENT_SECRET` | MP developers panel |
| `MP_OAUTH_STATE_SECRET` | `npm run mp:oauth-secret --workspace=backend` |
| `CLOUDINARY_*` | Cloudinary credentials |

Register the OAuth redirect URI in [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app).

**MongoDB Atlas:** allow `0.0.0.0/0` (or Render IPs).

---

## 3. Vercel — `frontend` (Expo web)

1. [Vercel Dashboard](https://vercel.com/new) → Import GitHub repo
2. **Root Directory:** `frontend`
3. Framework is auto-detected from `frontend/vercel.json`
4. **Environment variables** (Production):

```env
EXPO_PUBLIC_CLUB_API_URL=https://club-backend-xxxx.onrender.com/api
EXPO_PUBLIC_SUPER_API_URL=https://club-super-xxxx.onrender.com/api
```

5. Deploy

After deploy, set `FRONTEND_URL` on **club-backend** (Render) to your Vercel URL for CORS and Mercado Pago post-OAuth redirects.

### Local Expo (native / dev)

Create `frontend/.env` (not committed):

```env
EXPO_PUBLIC_CLUB_API_URL=https://club-backend-xxxx.onrender.com/api
EXPO_PUBLIC_SUPER_API_URL=https://club-super-xxxx.onrender.com/api
```

Restart Expo after changes. Without these vars, the app uses LAN IP / localhost.

---

## 4. superfront — local only

```bash
cd superfront
cp .env.example .env
npm install
npm run dev
```

`.env` points at Render **or** local super:

```env
# Render (recommended)
VITE_API_URL=https://club-super-xxxx.onrender.com/api

# Local super API
# VITE_API_URL=http://localhost:4000/api
```

Open `http://localhost:5173`.

---

## 5. Verify

| URL | Expected |
|-----|----------|
| `https://club-super-xxxx.onrender.com/` | Super-Admin OK message |
| `https://club-backend-xxxx.onrender.com/` | Club backend OK message |
| `https://your-app.vercel.app` | Login / workspace search |
| Admin → Mercado Pago connect | OAuth → Render callback → redirect to Vercel |

Free Render services sleep after inactivity (~30s cold start).
