import { countUnreadChatForUser } from './chat.service.js';

function transferRevisionGroupCount(revisionRows) {
    const revisionGroups = new Set(
        revisionRows.map((p) => {
            if (p.transferGrupoId) return String(p.transferGrupoId);
            const ts = p.fechaEnvioComprobante ? new Date(p.fechaEnvioComprobante).getTime() : 0;
            return `legacy:${p.comprobante || ''}|${p.enviadoPor || ''}|${ts}`;
        }),
    );
    return revisionGroups.size;
}

/** Conteos reutilizables por admin (bandeja + badges). */
export async function getAdminPendingCounts(models, userId) {
    const { EnrollmentRequest, Payment, Rental, Submission } = models;

    const [solicitudesInscripcion, revisionRows, alquileresPendientes, docsRevision, chatUnread] =
        await Promise.all([
            EnrollmentRequest.countDocuments({ estado: 'pendiente' }),
            Payment.find({ estado: 'en_revision' })
                .select('transferGrupoId comprobante enviadoPor fechaEnvioComprobante')
                .lean(),
            Rental.countDocuments({
                estadoPago: { $in: ['pendiente', 'señado'] },
                estadoReserva: 'confirmada',
            }),
            Submission.countDocuments({ estado: 'revision' }),
            countUnreadChatForUser(models, userId),
        ]);

    const transferenciasRevision = transferRevisionGroupCount(revisionRows);

    return {
        transferenciasRevision,
        docsRevision,
        solicitudesInscripcion,
        alquileres: alquileresPendientes,
        chat: chatUnread,
    };
}

/**
 * Ítems accionables con count > 0 para la bandeja de pendientes del admin.
 */
export async function listAdminPendingInbox(models, userId) {
    const counts = await getAdminPendingCounts(models, userId);
    const now = new Date().toISOString();

    const catalog = [
        {
            id: 'transferencias_revision',
            tipo: 'transferencias_revision',
            titulo: 'Transferencias por revisar',
            mensaje: 'Comprobantes de cuota en revisión',
            count: counts.transferenciasRevision,
            icon: 'receipt-outline',
            nav: { tab: 'Finanzas', screen: 'Finanzas', params: { initialTab: 'revision' } },
        },
        {
            id: 'docs_revision',
            tipo: 'docs_revision',
            titulo: 'Documentación por revisar',
            mensaje: 'Archivos subidos pendientes de aprobación',
            count: counts.docsRevision,
            icon: 'folder-open-outline',
            nav: { tab: 'Gestión', screen: 'RevisarDocumentacion' },
        },
        {
            id: 'solicitudes_inscripcion',
            tipo: 'solicitudes_inscripcion',
            titulo: 'Solicitudes de inscripción',
            mensaje: 'Pedidos de alta pendientes',
            count: counts.solicitudesInscripcion,
            icon: 'person-add-outline',
            nav: { tab: 'Estructura', screen: 'SolicitudesInscripcion' },
        },
        {
            id: 'alquileres',
            tipo: 'alquileres',
            titulo: 'Alquileres pendientes',
            mensaje: 'Reservas confirmadas con pago pendiente o seña',
            count: counts.alquileres,
            icon: 'time-outline',
            nav: { tab: 'Gestión', screen: 'Alquileres' },
        },
        {
            id: 'chat',
            tipo: 'chat',
            titulo: 'Mensajes sin leer',
            mensaje: 'Conversaciones con actividad pendiente',
            count: counts.chat,
            icon: 'chatbubbles-outline',
            nav: { tab: 'Gestión', screen: 'ChatInbox' },
        },
    ];

    return catalog
        .filter((item) => item.count > 0)
        .map((item) => ({
            ...item,
            createdAt: now,
        }));
}

export function sumPendingCounts(counts) {
    const total =
        (counts.transferenciasRevision || 0) +
        (counts.docsRevision || 0) +
        (counts.solicitudesInscripcion || 0) +
        (counts.alquileres || 0) +
        (counts.chat || 0);
    return total > 0 ? Math.min(99, total) : 0;
}
