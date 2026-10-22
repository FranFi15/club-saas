/** Light icons on dark brand colors, dark icons on pale ones. */
export function statusBarStyleForColor(color) {
  const raw = String(color || '').trim().replace('#', '');
  const hex = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 'light-content';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? 'dark-content' : 'light-content';
}

const AUTH_ROUTES = new Set([
  'Login',
  'ForgotPassword',
  'ResetPassword',
  'WorkspaceSearch',
  'TermsAcceptance',
  'SelectRole',
]);

export function isAuthRouteName(name) {
  return AUTH_ROUTES.has(name);
}
