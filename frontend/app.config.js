/** @type {import('expo/config').ExpoConfig} */
const APP_WEB_HOST = 'app.hermesclubapp.com';
const IOS_BUNDLE_ID = 'com.hermesclubapp.app';
const ANDROID_PACKAGE = 'com.hermesclubapp.app';
const EAS_PROJECT_ID = '1f64eb80-036b-47f1-8f80-83ba3351500e';
const PRIVACY_POLICY_URL = 'https://hermesclub.app/privacidad';
const withMonorepoReactNative = require('./plugins/withMonorepoReactNative.cjs');

export default ({ config }) => ({
  ...config,
  expo: {
    ...config.expo,
    slug: 'hermes-club-app',
    scheme: 'clubapp',
    ios: {
      ...config.expo?.ios,
      bundleIdentifier: IOS_BUNDLE_ID,
      associatedDomains: [`applinks:${APP_WEB_HOST}`],
      infoPlist: {
        CFBundleDisplayName: 'Hermes Club App',
        NSCameraUsageDescription:
          'Permite escanear el QR de ingreso de socios al club.',
        NSPhotoLibraryUsageDescription:
          'Permite subir fotos de comprobantes de pago y documentación del club.',
        NSPhotoLibraryAddUsageDescription:
          'Permite guardar comprobantes y documentos en tu galería.',
      },
      config: {
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
      ...config.expo?.android,
      package: ANDROID_PACKAGE,
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
    plugins: [...(config.expo?.plugins ?? []), withMonorepoReactNative],
    extra: {
      ...config.expo?.extra,
      appWebUrl: `https://${APP_WEB_HOST}`,
      privacyPolicyUrl: PRIVACY_POLICY_URL,
      eas: {
        ...config.expo?.extra?.eas,
        projectId: EAS_PROJECT_ID,
      },
    },
  },
});
