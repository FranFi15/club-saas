function trimUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

export const APP_WEB_URL = trimUrl(
  process.env.EXPO_PUBLIC_APP_URL || 'https://app.hermesclubapp.com',
);

export const APP_WEB_HOST = (() => {
  try {
    return new URL(APP_WEB_URL).host;
  } catch {
    return 'app.hermesclubapp.com';
  }
})();
