import { Platform } from 'react-native';
import { getToken } from '../../utils/storage';

export const ROL_LABELS = {
  admin_club: 'Administración',
  administrativo: 'Administración',
  control_ingreso: 'Control de ingreso',
  colaborador: 'Colaborador',
  profe: 'Entrenador',
  preparador_fisico: 'Prep. físico',
  nutricionista: 'Nutricionista',
  psicologo: 'Psicólogo',
  atleta: 'Atleta',
  tutor: 'Tutor',
  socio: 'Socio',
};

export function isAdminChatRole(rol) {
  return rol === 'admin_club' || rol === 'administrativo';
}

export function isGroupChatKind(kind) {
  return kind === 'category_group' || kind === 'staff_group';
}

export function groupChatDefaultTitle(kind, title) {
  if (kind === 'staff_group') return title || 'Personal del club';
  if (kind === 'category_group') return title || 'Chat de categoría';
  return title || 'Grupo';
}

export function groupChatSubtitle(kind, active) {
  if (kind === 'staff_group') {
    return active !== false ? 'Todo el personal del club' : 'Desactivado — solo lectura';
  }
  return active !== false ? 'Chat de categoría' : 'Desactivado — solo lectura';
}

export function displayName(user) {
  if (!user) return 'Usuario';
  if (isAdminChatRole(user.rol)) return 'Administración';
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

export const CHAT_POLL_MS = Platform.OS === 'web' ? 10000 : 8000;

const DELIVERY_TITLES = {
  requirement: 'Pedido de documentación',
  resource: 'Nuevo material',
};

const DELIVERY_ICONS = {
  requirement: 'document-attach-outline',
  resource: 'folder-open-outline',
};

const DELIVERY_CTA = {
  requirement: 'Ir a Documentación',
  resource: 'Ver material',
};

const STAFF_TEAM_TABS = [
  ['CoachEquipo', 'CoachTeamDocuments'],
  ['PrepEquipo', 'CoachTeamDocuments'],
  ['NutEquipo', 'CoachTeamDocuments'],
  ['PsiEquipo', 'CoachTeamDocuments'],
];

export function getDeliveryKind(message) {
  const kind = message?.kind || message?.action?.type;
  if (kind === 'requirement' || kind === 'resource') return kind;
  const first = String(message?.body || '').split('\n')[0]?.trim() || '';
  if (first.includes('Pedido de documentación')) return 'requirement';
  if (first.includes('Nuevo material')) return 'resource';
  return null;
}

export function getDeliveryPresentation(message) {
  const kind = getDeliveryKind(message);
  if (!kind) return null;

  const raw = String(message?.body || '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = DELIVERY_TITLES[kind];
  const bodyLines =
    lines[0] === title || lines[0] === `📄 ${title}` || lines[0] === `📎 ${title}`
      ? lines.slice(1)
      : lines;

  return {
    kind,
    icon: DELIVERY_ICONS[kind],
    title,
    bodyText: bodyLines.join('\n'),
    ctaLabel: message?.action?.label || DELIVERY_CTA[kind],
    showCta: true,
  };
}

function routeNames(nav) {
  return nav?.getState?.()?.routeNames || [];
}

/**
 * Navigate from ChatThread to documents / resources for the current role stack.
 */
export function navigateChatDeliveryAction(navigation, kind) {
  if (!navigation || (kind !== 'requirement' && kind !== 'resource')) return false;

  const names = routeNames(navigation);

  if (kind === 'requirement') {
    if (names.includes('MemberDocuments')) {
      navigation.navigate('MemberDocuments');
      return true;
    }
    if (names.includes('RevisarDocumentacion')) {
      navigation.navigate('RevisarDocumentacion');
      return true;
    }
    const parent = navigation.getParent?.();
    const tabs = routeNames(parent);
    for (const [tab, screen] of STAFF_TEAM_TABS) {
      if (tabs.includes(tab)) {
        parent.navigate(tab, { screen });
        return true;
      }
    }
    return false;
  }

  if (names.includes('MemberResources')) {
    navigation.navigate('MemberResources');
    return true;
  }
  if (names.includes('CoachResourceSend')) {
    navigation.navigate('CoachResourceSend');
    return true;
  }
  return false;
}
