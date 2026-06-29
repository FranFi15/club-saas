import { sendPushToUserIds } from './pushNotification.service.js';

/** Crea notificación in-app y envía push al dispositivo. */
export async function createAppNotification(models, { usuario, tipo, titulo, mensaje, referencia }) {
    const { Notification } = models;
    const doc = await Notification.create({
        usuario,
        tipo,
        titulo,
        mensaje,
        referencia,
    });

    try {
        await sendPushToUserIds(models, [usuario], {
            title: titulo,
            body: mensaje,
            data: {
                tipo,
                notificationId: String(doc._id),
                referencia: referencia ? String(referencia) : '',
            },
        });
    } catch (e) {
        console.warn('[push] createAppNotification:', e.message);
    }

    return doc;
}

/** Varias notificaciones (mismo payload) + push a cada usuario. */
export async function createAppNotificationsMany(models, usuarios, payload) {
    const { Notification } = models;
    const list = [...new Set((usuarios || []).map((u) => String(u)))].filter(Boolean);
    if (!list.length) return [];

    const docs = await Notification.insertMany(
        list.map((usuario) => ({
            usuario,
            tipo: payload.tipo,
            titulo: payload.titulo,
            mensaje: payload.mensaje,
            referencia: payload.referencia,
        })),
    );

    try {
        await sendPushToUserIds(models, list, {
            title: payload.titulo,
            body: payload.mensaje,
            data: {
                tipo: payload.tipo,
                referencia: payload.referencia ? String(payload.referencia) : '',
            },
        });
    } catch (e) {
        console.warn('[push] createAppNotificationsMany:', e.message);
    }

    return docs;
}
