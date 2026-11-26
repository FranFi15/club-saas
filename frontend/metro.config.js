const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 54+ auto-detects npm workspaces; no manual watchFolders needed.
const config = getDefaultConfig(__dirname);

const safePagerAdapter = path.resolve(__dirname, 'src/navigation/SafePagerViewAdapter.js');

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromTabView =
    typeof context.originModulePath === 'string' &&
    context.originModulePath.replace(/\\/g, '/').includes('/react-native-tab-view/');

  if (
    fromTabView &&
    (moduleName === './PagerViewAdapter' ||
      moduleName === './PagerViewAdapter.js' ||
      moduleName === './PagerViewAdapter.ts' ||
      moduleName === './PagerViewAdapter.tsx')
  ) {
    return { type: 'sourceFile', filePath: safePagerAdapter };
  }

  if (typeof upstreamResolve === 'function') {
    return upstreamResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
