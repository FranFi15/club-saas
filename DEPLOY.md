# Deploy — GitHub + Render + Vercel

| Package | Host | Notes |
|---------|------|--------|
| `super` | **Render** | Tenant registry API |
| `backend` | **Render** | Club API + Mercado Pago OAuth |
| `frontend` | **Vercel** @ `app.hermesclubapp.com` | Expo web + universal links |
| `frontend` (native) | **EAS Build** | iOS + Android — see [MOBILE.md](./MOBILE.md) |
| `superfront` | **Local** | Super-admin UI (`npm run dev`) |

Native mobile uses the same `EXPO_PUBLIC_*` URLs as the web app at **https://app.hermesclubapp.com**.

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
| `FRONTEND_URL` | `https://app.hermesclubapp.com` (no trailing slash). Comma-separated for extra origins. |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | `https://club-backend-xxxx.onrender.com/api/mercadopago/oauth/callback` |
| `MERCADOPAGO_CLIENT_ID` / `MERCADOPAGO_CLIENT_SECRET` | MP developers panel |
| `MP_OAUTH_STATE_SECRET` | `npm run mp:oauth-secret --workspace=backend` |
| `CLOUDINARY_*` | Cloudinary credentials |

Register the OAuth redirect URI in [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app).

**MongoDB Atlas:** allow `0.0.0.0/0` (or Render IPs).

---

## 3. Vercel — `frontend` (web @ app.hermesclubapp.com)

1. [Vercel Dashboard](https://vercel.com/new) → Import GitHub repo
2. **Root Directory:** `frontend`
3. **Custom domain:** `app.hermesclubapp.com`
4. Framework is auto-detected from `frontend/vercel.json`
5. **Environment variables** (Production):

```env
EXPO_PUBLIC_APP_URL=https://app.hermesclubapp.com
EXPO_PUBLIC_CLUB_API_URL=https://club-backend-xxxx.onrender.com/api
EXPO_PUBLIC_SUPER_API_URL=https://club-super-xxxx.onrender.com/api
```

6. Deploy

Set `FRONTEND_URL` on **club-backend** (Render) to `https://app.hermesclubapp.com` for CORS and Mercado Pago redirects.

### iOS & Android (EAS)

See **[MOBILE.md](./MOBILE.md)** for `eas build`, TestFlight/APK preview, universal links, and store submission.

### Local Expo (native / dev)

Create `frontend/.env` (not committed):

```env
EXPO_PUBLIC_APP_URL=https://app.hermesclubapp.com
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

## 5. Mercado Pago OAuth (producción)

### A. App en [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app)

1. Creá o abrí tu aplicación.
2. **Credenciales** → copiá **Client ID** y **Client Secret**.
3. **Redirect URI** (OAuth) — debe coincidir **exacto** con Render:

   `https://TU-BACKEND.onrender.com/api/mercadopago/oauth/callback`

   Ejemplo: `https://club-backend.onrender.com/api/mercadopago/oauth/callback`

### B. Variables en `club-backend` (Render)

| Variable | Valor |
|----------|--------|
| `MERCADOPAGO_CLIENT_ID` | Client ID de la app MP |
| `MERCADOPAGO_CLIENT_SECRET` | Client Secret |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | `https://club-backend-t1qz.onrender.com/api/mercadopago/oauth/callback` |
| `MP_OAUTH_STATE_SECRET` | Generar: `npm run mp:oauth-secret --workspace=backend` (mín. 16 chars) |
| `MERCADOPAGO_OAUTH_USE_PKCE` | `true` |
| `FRONTEND_URL` | `https://app.hermesclubapp.com` |
| `PUBLIC_API_URL` / `BACKEND_URL` | `https://TU-BACKEND.onrender.com` |

Opcional: `MERCADOPAGO_ACCESS_TOKEN` solo como fallback global; con OAuth por club no hace falta.

Guardá → Render redeploy.

### C. Probar en la app

1. Entrá como **admin del club** en [app.hermesclubapp.com](https://app.hermesclubapp.com/).
2. **Perfil** → **Conectar a Mercado Pago**.
3. Iniciás sesión en Mercado Pago y autorizás.
4. MP redirige al callback en Render → la app vuelve a Vercel (`/mp-oauth/success`).
5. En Perfil debería quedar vinculado (`tokenSource: club`).

Si el botón dice *"OAuth no configurado"*, revisá logs de Render: faltan `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` o `MP_OAUTH_STATE_SECRET`.

---

## 6. Verify

| URL | Expected |
|-----|----------|
| `https://club-super-xxxx.onrender.com/` | Super-Admin OK message |
| `https://club-backend-xxxx.onrender.com/` | Club backend OK message |
| `https://app.hermesclubapp.com` | Login / workspace search |
| Admin → Mercado Pago connect | OAuth → Render callback → redirect to Vercel |

Free Render services sleep after inactivity (~30s cold start).
