import { useEffect, useContext } from 'react';
import { Linking, Platform } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';
import { ClubContext } from '../context/ClubContext';
import { superAdminApi } from '../utils/api';
import { APP_WEB_URL } from '../constants/appUrl';

function parseResetPasswordUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let path = '';
  let search = '';
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
      const parsed = new URL(url);
      const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (isHttp) {
        path = (parsed.pathname || '').replace(/^\/+|\/+$/g, '');
        search = parsed.search || '';
      } else {
        // clubapp://reset-password?token=… or clubapp://reset-password/…
        const host = (parsed.hostname || '').replace(/^\/+|\/+$/g, '');
        const pathPart = (parsed.pathname || '').replace(/^\/+|\/+$/g, '');
        path = [host, pathPart].filter(Boolean).join('/');
        search = parsed.search || '';
      }
    } else {
      const [p, q] = url.split('?');
      path = (p || '').replace(/^\/+|\/+$/g, '');
      search = q ? `?${q}` : '';
    }
  } catch {
    return null;
  }

  if (!path.startsWith('reset-password')) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const token = String(params.get('token') || '').trim();
  const club = String(params.get('club') || '').trim().toLowerCase();
  if (!token) return null;
  return { token, club };
}

function handleWebResetReturn() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const search = window.location.search || '';
    const parsed = parseResetPasswordUrl(`${APP_WEB_URL}/${path}${search}`);
    if (parsed) {
      window.history.replaceState({}, document.title, '/');
    }
    return parsed;
  } catch {
    return null;
  }
}

async function openResetScreen(payload, setClubData) {
  if (!payload?.token) return false;

  for (let i = 0; i < 40 && !navigationRef.isReady(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!navigationRef.isReady()) return false;

  if (payload.club) {
    try {
      const response = await superAdminApi.get(`/clubs/public/${payload.club}`);
      await setClubData(response.data);
    } catch {
      /* ResetPasswordScreen also tries to load the club */
    }
  }

  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'ResetPassword',
      params: { token: payload.token, club: payload.club || undefined },
    }),
  );
  return true;
}

export default function PasswordResetDeepLinkHandler() {
  const { setClubData } = useContext(ClubContext);

  useEffect(() => {
    let cancelled = false;

    const run = async (url) => {
      const parsed = parseResetPasswordUrl(url);
      if (!parsed || cancelled) return;
      await openResetScreen(parsed, setClubData);
    };

    const fromWeb = handleWebResetReturn();
    if (fromWeb) {
      openResetScreen(fromWeb, setClubData);
    }

    Linking.getInitialURL().then((url) => {
      if (url) run(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => run(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [setClubData]);

  return null;
}
