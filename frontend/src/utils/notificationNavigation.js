const CUOTA_TIPOS = ['cuota_vencida', 'cuota_proxima', 'pago_registrado'];

const STAFF_NEWS_ROLES = new Set([
  'admin_club',
  'administrativo',
  'profe',
  'preparador_fisico',
  'nutricionista',
  'psicologo',
]);

function staffCommsTab(rol) {
  if (rol === 'profe') return 'CoachComunicar';
  if (rol === 'preparador_fisico') return 'PrepComunicar';
  if (rol === 'nutricionista') return 'NutComunicar';
  if (rol === 'psicologo') return 'PsiComunicar';
  return null;
}

function staffEquipoTab(rol) {
  if (rol === 'profe') return 'CoachEquipo';
  if (rol === 'preparador_fisico') return 'PrepEquipo';
  if (rol === 'nutricionista') return 'NutEquipo';
  if (rol === 'psicologo') return 'PsiEquipo';
  return null;
}

function staffNewsTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión', screen: 'Noticias' };
  }
  const tab = staffCommsTab(rol);
  if (tab) return { tab, screen: 'NoticiasStaff' };
  return null;
}

function staffResourceTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión' };
  }
  const tab = staffCommsTab(rol);
  if (tab) return { tab, screen: 'CoachResourceSend' };
  return null;
}

function staffDocsTarget(rol) {
  if (rol === 'admin_club' || rol === 'administrativo') {
    return { tab: 'Gestión', screen: 'PedirDocumentacion' };
  }
  const tab = staffCommsTab(rol);
  if (tab) return { tab, screen: 'CoachRequestDoc' };
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
    if (rol === 'socio') return { tab: 'SocioCuotas' };
    if (rol === 'admin_club' || rol === 'administrativo') return { tab: 'Finanzas', screen: 'FinanzasHome' };
    return null;
  }

  if (tipo === 'noticia') {
    if (rol === 'atleta') return { tab: 'AthleteComunicar', screen: 'MemberNews' };
    if (isTutor || rol === 'tutor') {
      return { tab: 'TutorComunicar', screen: 'MemberNews' };
    }
    if (rol === 'socio') return { tab: 'SocioNoticias', screen: 'SocioNewsMain' };
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
    const equipo = staffEquipoTab(rol);
    if (equipo) {
      return { tab: equipo, screen: 'CoachTeamDocuments' };
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
    if (rol === 'profe') {
      return { tab: 'CoachSesiones', screen: 'CoachRelocateSessions' };
    }
    if (rol === 'preparador_fisico') {
      return { tab: 'PrepSesiones', screen: 'CoachRelocateSessions' };
    }
    if (rol === 'admin_club' || rol === 'administrativo') {
      return { tab: 'Estructura', screen: 'Espacios' };
    }
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

  if (tipo === 'chat') {
    const params = item?.conversationId
      ? { conversationId: item.conversationId }
      : undefined;
    if (rol === 'admin_club' || rol === 'administrativo') {
      return {
        tab: 'Gestión',
        screen: item?.conversationId ? 'ChatThread' : 'ChatInbox',
        params: item?.conversationId
          ? { conversationId: item.conversationId }
          : undefined,
      };
    }
    if (rol === 'atleta') {
      return {
        tab: 'AthleteComunicar',
        screen: item?.conversationId ? 'ChatThread' : 'ChatInbox',
        params,
      };
    }
    if (isTutor || rol === 'tutor') {
      return {
        tab: 'TutorComunicar',
        screen: item?.conversationId ? 'ChatThread' : 'ChatInbox',
        params,
      };
    }
    if (rol === 'socio') {
      return {
        tab: 'SocioChat',
        screen: item?.conversationId ? 'ChatThread' : 'ChatInbox',
        params,
      };
    }
    const comms = staffCommsTab(rol);
    if (comms) {
      return {
        tab: comms,
        screen: item?.conversationId ? 'ChatThread' : 'ChatInbox',
        params,
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
