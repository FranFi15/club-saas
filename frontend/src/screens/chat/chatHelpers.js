import { Platform } from 'react-native';
import { getToken } from '../../utils/storage';

export const ROL_LABELS = {
  admin_club: 'Administración',
  administrativo: 'Administrativo',
  profe: 'Entrenador',
  preparador_fisico: 'Prep. físico',
  nutricionista: 'Nutricionista',
  psicologo: 'Psicólogo',
  atleta: 'Atleta',
  tutor: 'Tutor',
};

export function displayName(user) {
  if (!user) return 'Usuario';
  const n = `${user.nombre || ''} ${user.apellido || ''}`.trim();
  return n || user.email || 'Usuario';
}

export function rolLabel(rol) {
  return ROL_LABELS[rol] || rol || '';
}

export async function chatHeaders(clubIdentifier) {
  const token = await getToken('userToken');
  return {
    'x-club-identifier': clubIdentifier,
    Authorization: `Bearer ${token}`,
  };
}

export function formatChatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export const CHAT_POLL_MS = Platform.OS === 'web' ? 5000 : 4000;
