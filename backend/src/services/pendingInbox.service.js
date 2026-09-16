import { countUnreadChatForUser } from './chat.service.js';
import { calendarMonthYearInTz, DEFAULT_CLUB_TIMEZONE } from '../utils/timeHelper.js';

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
export async function getAdminPendingCounts(models, userId, timezone = DEFAULT_CLUB_TIMEZONE) {
    const { EnrollmentRequest, Payment, Rental, Submission } = models;

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const alquilerDesde = new Date(hoy);
    alquilerDesde.setUTCDate(alquilerDesde.getUTCDate() - 7);
    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    // Un solo round-trip a Payment ($facet) en lugar de find(en_revision) + count(impagas mes).
    const [solicitudesInscripcion, paymentFacet, alquileresPendientes, docsRevision, chatUnread] =
        await Promise.all([
            EnrollmentRequest.countDocuments({ estado: 'pendiente' }),
            Payment.aggregate([
                {
                    $facet: {
                        revision: [
                            { $match: { estado: 'en_revision' } },
                            {
                                $project: {
                                    transferGrupoId: 1,
                                    comprobante: 1,
                                    enviadoPor: 1,
                                    fechaEnvioComprobante: 1,
                                },
                            },
                        ],
                        impagasMes: [
                            {
                                $match: {
                                    mes,
                                    anio,
                                    estado: { $in: ['pendiente', 'vencido'] },
                                },
                            },
                            { $count: 'n' },
                        ],
                    },
                },
            ]),
            Rental.countDocuments({
                estadoPago: { $in: ['pendiente', 'señado'] },
                estadoReserva: 'confirmada',
                fecha: { $gte: alquilerDesde },
            }),
            Submission.countDocuments({ estado: 'revision' }),
            countUnreadChatForUser(models, userId),
        ]);

    const facet = paymentFacet[0] || { revision: [], impagasMes: [] };
    const transferenciasRevision = transferRevisionGroupCount(facet.revision || []);
    const finanzasImpagasMes = facet.impagasMes?.[0]?.n || 0;

    return {
        transferenciasRevision,
        docsRevision,
        solicitudesInscripcion,
        alquileres: alquileresPendientes,
        chat: chatUnread,
        finanzasImpagasMes,
    };
}

/**
 * Ítems accionables con count > 0 para la bandeja de pendientes del admin.
 */
export async function listAdminPendingInbox(models, userId, timezone = DEFAULT_CLUB_TIMEZONE) {
    const counts = await getAdminPendingCounts(models, userId, timezone);
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
            mensaje: 'Reservas (últimos 7 días / futuras) con pago pendiente o seña',
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
