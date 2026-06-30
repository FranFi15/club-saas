# Mobile builds — iOS & Android (Expo EAS)

Web app: **https://app.hermesclubapp.com** (Vercel)  
Native package: **com.hermesclubapp.app**  
Deep link scheme: **clubapp://**

---

## 1. Prerequisites

```bash
npm install
npm install -g eas-cli   # or use npx eas
eas login
```

Apple Developer account + Google Play Console (for store submission later).

---

## 2. Link EAS project (once)

```bash
cd frontend
eas init
```

This adds `extra.eas.projectId` to your Expo project on expo.dev.

---

## 3. Environment variables

Copy `frontend/.env.example` → `frontend/.env` for local dev.

**EAS Build** (expo.dev → Project → Environment variables) — set for `production` and `preview`:

| Variable | Value |
|----------|--------|
| `EXPO_PUBLIC_APP_URL` | `https://app.hermesclubapp.com` |
| `EXPO_PUBLIC_CLUB_API_URL` | `https://TU-BACKEND.onrender.com/api` |
| `EXPO_PUBLIC_SUPER_API_URL` | `https://club-super.onrender.com/api` |

**Render `club-backend`** — update:

| Variable | Value |
|----------|--------|
| `FRONTEND_URL` | `https://app.hermesclubapp.com` |
| `APP_DEEP_LINK_SCHEME` | `clubapp` |

---

## 4. Build before store approval (internal testing)

### Android APK (share with testers)

```bash
cd frontend
npm run build:preview:android
```

Install the APK from the EAS build page.

### iOS (TestFlight / internal)

```bash
npm run build:preview:ios
```

Requires Apple Developer enrollment. Upload via EAS or Transporter.

### Mercado Pago OAuth on native (before universal links verified)

1. Admin → **Conectar Mercado Pago** → browser opens MP.
2. After authorize, callback page offers:
   - **Abrir Hermes Club App** → `https://app.hermesclubapp.com/mp-oauth/success`
   - **¿Usás la app en el celular?** → `clubapp://mp-oauth/success` (works with custom scheme)

---

## 5. Universal links (after domain + store setup)

Files in `frontend/public/.well-known/` deploy with the web app on Vercel:

| File | Update |
|------|--------|
| `apple-app-site-association` | Replace `REPLACE_APPLE_TEAM_ID` with your Apple Team ID |
| `assetlinks.json` | Replace SHA256 with fingerprint from `eas credentials -p android` |

Verify:

- iOS: https://app.hermesclubapp.com/.well-known/apple-app-site-association
- Android: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.hermesclubapp.com&relation=delegate_permission/common.handle_all_urls

Once verified, OAuth/payment returns open the installed app automatically.

---

## 6. Production store builds

```bash
cd frontend
npm run build:mobile    # iOS + Android
# or
npm run build:ios
npm run build:android
```

### Submit to stores (when ready)

1. Fill `eas.json` → `submit.production` with Apple ID, ASC App ID, Team ID.
2. Add `google-play-service-account.json` locally (gitignored).
3. Run:

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

---

## 7. Vercel (web at app.hermesclubapp.com)

1. Point DNS **app.hermesclubapp.com** → Vercel project (`frontend/` root).
2. Set env vars (same `EXPO_PUBLIC_*` as above).
3. Redeploy.

---

## Quick reference

| Profile | Use |
|---------|-----|
| `development` | Dev client, internal |
| `preview` | APK / internal iOS, MP OAuth testing |
| `production` | App Store + Play Store |
