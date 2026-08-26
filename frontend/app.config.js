/** @type {import('expo/config').ExpoConfig} */
const APP_WEB_HOST = 'app.hermesclubapp.com';
const IOS_BUNDLE_ID = 'com.hermesclubapp.app';
const ANDROID_PACKAGE = 'com.hermesclubapp.app';
const EAS_PROJECT_ID = '1f64eb80-036b-47f1-8f80-83ba3351500e';
const PRIVACY_POLICY_URL = 'https://hermesclubapp.com/privacidad';
const TERMS_OF_SERVICE_URL = 'https://hermesclubapp.com/terminos';
const withMonorepoReactNative = require('./plugins/withMonorepoReactNative.cjs');

// Native release builds try to upload Sentry source maps. Without SENTRY_ORG that
// step fails the Xcode/Gradle job. Skip upload unless org+project are provided.
if (!process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT) {
  process.env.SENTRY_DISABLE_AUTO_UPLOAD = 'true';
}

export default ({ config }) => ({
  ...config,
  name: 'Hermes Club App',
  slug: 'hermes-club-app',
  scheme: 'clubapp',
  version: config.version || '1.0.5',
  ios: {
    ...config.ios,
    bundleIdentifier: IOS_BUNDLE_ID,
    buildNumber: config.ios?.buildNumber || '8',
    associatedDomains: [`applinks:${APP_WEB_HOST}`],
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleDisplayName: 'Hermes Club App',
      NSCameraUsageDescription:
        'Permite escanear el QR de ingreso de socios al club.',
      NSPhotoLibraryUsageDescription:
        'Permite subir fotos de comprobantes de pago y documentación del club.',
      NSPhotoLibraryAddUsageDescription:
        'Permite guardar comprobantes y documentos en tu galería.',
    },
    config: {
      ...config.ios?.config,
      usesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  android: {
    ...config.android,
    package: ANDROID_PACKAGE,
    versionCode: config.android?.versionCode || 13,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: APP_WEB_HOST, pathPrefix: '/mp-oauth' },
          { scheme: 'https', host: APP_WEB_HOST, pathPrefix: '/pago' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [...(config.plugins ?? []), withMonorepoReactNative, '@sentry/react-native/expo'],
  extra: {
    ...config.extra,
    appWebUrl: `https://${APP_WEB_HOST}`,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    termsOfServiceUrl: TERMS_OF_SERVICE_URL,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || config.extra?.sentryDsn || '',
    eas: {
      ...config.extra?.eas,
      projectId: EAS_PROJECT_ID,
    },
  },
});
