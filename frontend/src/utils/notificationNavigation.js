const CUOTA_TIPOS = ['cuota_vencida', 'cuota_proxima', 'pago_registrado'];

const STAFF_NEWS_ROLES = new Set([
  'admin_club',
  'administrativo',
  'profe',
  'preparador_fisico',
  'nutricionista',
  'psicologo',
]);

function staffNewsTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión', screen: 'Noticias' };
  }
  if (STAFF_NEWS_ROLES.has(rol)) {
    return { tab: 'CoachComunicar', screen: 'NoticiasStaff' };
  }
  return null;
}

function staffResourceTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión' };
  }
  if (STAFF_NEWS_ROLES.has(rol)) {
    return { tab: 'CoachComunicar', screen: 'CoachResourceSend' };
  }
  return null;
}

function staffDocsTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión', screen: 'PedirDocumentacion' };
  }
  if (STAFF_NEWS_ROLES.has(rol)) {
    return { tab: 'CoachComunicar', screen: 'CoachRequestDoc' };
  }
  return null;
}

/**
 * @returns {{ tab: string, screen?: string, params?: object } | null}
 */
export function getNotificationTarget(item, { rol, cuotasEnApp, isTutor }) {
  const tipo = item?.tipo;

  if (CUOTA_TIPOS.includes(tipo)) {
    if (rol === 'atleta' && !cuotasEnApp) return null;
    if (rol === 'atleta') return { tab: 'AthleteProfile', screen: 'AthletePayments' };
    if (rol === 'tutor') return { tab: 'TutorProfile', screen: 'TutorPayments' };
    if (rol === 'admin_club' || rol === 'administrativo') return { tab: 'Finanzas', screen: 'Finanzas' };
    return null;
  }

  if (tipo === 'noticia') {
    if (rol === 'atleta') return { tab: 'AthleteComunicar', screen: 'MemberNews' };
    if (isTutor || rol === 'tutor') {
      return { tab: 'TutorComunicar', screen: 'MemberNews' };
    }
    return staffNewsTarget(rol);
  }

  if (tipo === 'recurso') {
    if (rol === 'atleta') {
      return { tab: 'AthleteComunicar', screen: 'MemberResources' };
    }
    if (isTutor || rol === 'tutor') {
      return { tab: 'TutorComunicar', screen: 'MemberResources' };
    }
    return staffResourceTarget(rol);
  }

  if (tipo === 'documentacion_entregada') {
    if (STAFF_NEWS_ROLES.has(rol)) {
      return { tab: 'CoachEquipo', screen: 'CoachTeamDocuments' };
    }
    if (rol === 'admin_club' || rol === 'administrativo') {
      return { tab: 'Gestión', screen: 'RevisarDocumentacion' };
    }
    return null;
  }

  if (tipo === 'documentacion') {
    if (rol === 'atleta') {
      return { tab: 'AthleteComunicar', screen: 'MemberDocuments' };
    }
    if (isTutor || rol === 'tutor') {
      return { tab: 'TutorComunicar', screen: 'MemberDocuments' };
    }
    return staffDocsTarget(rol);
  }

  if (tipo === 'intercambio_espacio') {
    return null;
  }

  if (['consulta_pendiente', 'consulta_confirmada', 'consulta_rechazada'].includes(tipo)) {
    if (rol === 'atleta') return { tab: 'AthleteAgenda' };
    if (isTutor || rol === 'tutor') return { tab: 'TutorAgenda' };
    if (rol === 'nutricionista') {
      return {
        tab: 'NutSesiones',
        screen: 'CoachSessionDetail',
        params: { sessionId: item.referencia },
      };
    }
    if (rol === 'psicologo') {
      return {
        tab: 'PsiSesiones',
        screen: 'CoachSessionDetail',
        params: { sessionId: item.referencia },
      };
    }
  }

  return null;
}

export function navigateFromNotification(navigation, item, ctx) {
  const target = getNotificationTarget(item, ctx);
  if (!target || !navigation?.navigate) return false;

  const { tab, screen, params } = target;
  if (screen) {
    navigation.navigate(tab, { screen, params });
  } else {
    navigation.navigate(tab, params);
  }
  return true;
}
