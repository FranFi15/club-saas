import { saveToken } from './storage';

/** Persiste nombre/apellido/email/foto en storage tras actualizar el perfil. */
export async function persistUserTokensFromProfile(user) {
  if (!user) return;
  if (user.nombre != null) await saveToken('userNombre', String(user.nombre));
  if (user.apellido != null) await saveToken('userApellido', String(user.apellido));
  if (user.email != null) await saveToken('userEmail', String(user.email));
  if (user.fotoPerfil != null) await saveToken('userFotoPerfil', String(user.fotoPerfil));
}
