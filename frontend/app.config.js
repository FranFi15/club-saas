/** @type {import('expo/config').ExpoConfig} */
const APP_WEB_HOST = 'app.hermesclubapp.com';
const IOS_BUNDLE_ID = 'com.hermesclubapp.app';
const ANDROID_PACKAGE = 'com.hermesclubapp.app';

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
    extra: {
      ...config.expo?.extra,
      appWebUrl: `https://${APP_WEB_HOST}`,
      eas: {
        ...config.expo?.extra?.eas,
      },
    },
  },
});
