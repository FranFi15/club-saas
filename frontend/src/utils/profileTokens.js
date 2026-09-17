import { saveToken } from './storage';

/** Persiste nombre/apellido/email/foto/roles en storage tras actualizar el perfil. */
export async function persistUserTokensFromProfile(user) {
  if (!user) return;
  if (user.nombre != null) await saveToken('userNombre', String(user.nombre));
  if (user.apellido != null) await saveToken('userApellido', String(user.apellido));
  if (user.email != null) await saveToken('userEmail', String(user.email));
  if (user.fotoPerfil != null) await saveToken('userFotoPerfil', String(user.fotoPerfil));
  if (user.rol) await saveToken('userRol', String(user.rol));
  if (Array.isArray(user.roles)) {
    await saveToken('userRoles', JSON.stringify(user.roles.filter(Boolean)));
  }
}
