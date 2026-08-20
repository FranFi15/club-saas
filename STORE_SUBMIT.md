# App Store & Google Play — Hermes Club App

EAS project: [@franfi15/hermes-club-app](https://expo.dev/accounts/franfi15/projects/hermes-club-app)  
Package: `com.hermesclubapp.app`  
Privacy policy: https://hermesclubapp.com/privacidad/

---

## Before you start

| Requirement | Apple | Google |
|-------------|-------|--------|
| Developer account | [Apple Developer](https://developer.apple.com) ($99/año) | [Google Play Console](https://play.google.com/console) ($25 única vez) |
| App listing | App Store Connect | Play Console → Crear app |
| Privacy policy URL | ✅ `https://hermesclubapp.com/privacidad/` | ✅ misma URL |

---

## 1. EAS is already linked

Project ID: `1f64eb80-036b-47f1-8f80-83ba3351500e` (in `frontend/app.config.js`).

Logged in as: `franfi15`

---

## 2. Production builds

```bash
cd frontend

# Android (AAB for Play Store)
npm run build:android

# iOS (IPA for App Store)
npm run build:ios

# Both
npm run build:mobile
```

First build will prompt for credentials (or run in browser). EAS can generate Android keystore and iOS certificates automatically.

Builds appear at: https://expo.dev/accounts/franfi15/projects/hermes-club-app/builds

---

## 3. Google Play — submit

### A. Create app in Play Console

1. **Crear app** → nombre **Hermes Club App**
2. Package name: `com.hermesclubapp.app` (must match)
3. Completar cuestionario de contenido, política de privacidad, capturas de pantalla

### B. Submit with EAS (automated)

1. Play Console → **Setup → API access** → crear service account
2. Descargar JSON → guardar como `frontend/google-play-service-account.json` (gitignored)
3. En Play Console, dar permiso **Release manager** a la service account
4. **Completar en Play Console** (obligatorio antes del primer upload):
   - Ficha de la tienda (descripción, capturas, ícono)
   - Política de privacidad: `https://hermesclubapp.com/privacidad/`
   - Clasificación de contenido
   - Público objetivo
   - Formularios de **App content** (permisos de fotos/video si aplica)
5. **Primera subida → track Internal** (no Production):

```bash
cd frontend
npm run submit:android
```

Esto sube al track **internal** de prueba. Cuando funcione, podés promover desde Play Console o usar:

```bash
npm run submit:android:production
```

(`production` usa `releaseStatus: draft` hasta que la ficha esté 100% lista.)

#### Error: `Precondition check failed`

Significa que Play Console aún no está listo para ese track. Causas habituales:

| Causa | Qué hacer |
|-------|-----------|
| Primera app, sin release previo | Subir primero a **Internal** (`npm run submit:android`) |
| Ficha incompleta | Completar store listing + App content en Play Console |
| Cuenta personal (post nov 2023) | Google exige **prueba cerrada** (12 testers, 14 días) antes de Production |
| Permisos foto/video | Subir el AAB **manual** una vez en Play Console para que aparezca el formulario de permisos |
| Borrador abierto en la consola | Cerrar/cancelar releases en borrador y reintentar |

Si EAS sigue fallando, subí el `.aab` manualmente (sección C) — suele mostrar el error exacto que falta.

### C. Manual upload (alternative)

Download the `.aab` from the EAS build page → Play Console → **Production** → **Create release** → upload.

### D. Fix Android App Links (`/mp-oauth`, `/pago`)

Play Console shows “Los vínculos directos no funcionan” until Digital Asset Links is configured.

1. Open Play Console → your app → **Protegido con Play** (antes: *Integridad de la app*)
2. Abrí la sección de **Firma de apps** / **App signing**
3. Copy the **SHA-256 certificate fingerprint** of **App signing key** (and ideally also **Upload key**)
4. Put them in `frontend/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.hermesclubapp.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:...from Play App signing key...",
        "DD:EE:FF:...from Upload key (optional but recommended)..."
      ]
    }
  }
]
```

5. Redeploy the web app (`app.hermesclubapp.com`) so this URL returns the real fingerprints:
   - https://app.hermesclubapp.com/.well-known/assetlinks.json
6. In Play Console → **Deep links**, click **Verify** / wait for revalidation.

If the live file still shows `REPLACE_WITH_EAS_ANDROID_SHA256_FINGERPRINT`, domain ownership will keep failing.

Tip: en esa misma pantalla Play suele mostrar un bloque **Digital Asset Links JSON** listo para copiar.

---

## 4. Apple App Store — submit

### A. App Store Connect

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** New App
2. Name: **Hermes Club App**
3. Bundle ID: `com.hermesclubapp.app` (register in Apple Developer → Identifiers if needed)
4. SKU: `hermes-club-app`
5. Privacy policy URL: `https://hermesclubapp.com/privacidad/`

### B. Submit with EAS

First time — set Apple credentials:

```bash
cd frontend
npx eas credentials -p ios
```

Then build + submit:

```bash
npm run build:ios
npm run submit:ios
```

EAS will ask for Apple ID / app-specific password or use App Store Connect API key.

### C. Update universal links (after Apple Team ID known)

1. Get **Team ID** from Apple Developer → Membership
2. Edit `frontend/public/.well-known/apple-app-site-association`:
   `REPLACE_APPLE_TEAM_ID` → your Team ID (e.g. `AB12CD34EF`)
3. Redeploy `app.hermesclubapp.com` on Vercel
4. Update Android `assetlinks.json` with SHA256 from:
   ```bash
   npx eas credentials -p android
   ```

---

## 5. Store listing copy (suggested)

**Short description (Google):**  
Gestión integral para tu club deportivo: cuotas, plantel, entrenamientos y comunicación.

**Full description:**  
Hermes Club App conecta administración, cuerpo técnico, atletas y tutores en una sola plataforma. Finanzas y Mercado Pago, asistencia, agenda, documentación, noticias y control de ingreso con QR.

**Category:** Sports / Business  
**Keywords:** club, deporte, cuotas, entrenamientos, gestión

---

## 6. Screenshots needed

| Platform | Sizes |
|----------|--------|
| iPhone | 6.7" and 6.5" (1290×2796 or 1284×2778) |
| Android | Phone 1080×1920 minimum |

Tip: open https://app.hermesclubapp.com on a phone emulator or use browser devtools device mode.

---

## 7. Scripts reference

| Command | Action |
|---------|--------|
| `npm run build:android` | Production AAB |
| `npm run build:ios` | Production IPA |
| `npm run submit:android` | Upload latest build to Play **Internal** track |
| `npm run submit:android:production` | Upload to Production (draft) |
| `npm run submit:ios` | Upload latest iOS build to App Store Connect |
| `npm run build:preview:android` | APK for testers (not store) |

---

## 8. After approval

- Universal links for Mercado Pago OAuth will open the native app automatically
- Push notifications require production FCM (Android) + APNs (iOS) — configure in EAS credentials if not done during first build
