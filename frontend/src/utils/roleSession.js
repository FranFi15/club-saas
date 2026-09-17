import { saveToken, getToken, removeToken } from './storage';
import { persistAuthTokens } from './authTokens';

export async function persistUserRoles(roles) {
  const list = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (list.length) await saveToken('userRoles', JSON.stringify(list));
  else await removeToken('userRoles');
}

export async function getStoredUserRoles() {
  try {
    const raw = await getToken('userRoles');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Persist tokens + active rol + roles after login / select-role / refresh. */
export async function persistAuthSessionUser(data = {}) {
  const { token, refreshToken, rol, roles, nombre, apellido, _id, fotoPerfil, acceptedTermsVersion } =
    data;
  if (token || refreshToken) {
    await persistAuthTokens({ token, refreshToken });
  }
  if (rol) await saveToken('userRol', rol);
  if (roles != null) await persistUserRoles(roles);
  if (nombre != null) await saveToken('userNombre', String(nombre));
  if (apellido != null) await saveToken('userApellido', String(apellido));
  if (_id != null) await saveToken('userId', String(_id));
  if (fotoPerfil != null) await saveToken('userFotoPerfil', String(fotoPerfil));
  if (acceptedTermsVersion != null) {
    await saveToken('acceptedTermsVersion', String(acceptedTermsVersion || ''));
  }
}
