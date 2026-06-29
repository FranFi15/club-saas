import asyncHandler from 'express-async-handler';
import {
    buildUnifiedNotificationFeed,
    markFeedItemRead,
    markAllFeedRead,
    dismissFeedItem,
    dismissAllFeedItems,
} from '../services/notificationFeed.service.js';

// @desc    Feed unificado: DB + novedades + documentación pendiente + recursos
// @route   GET /api/notifications
const getMyNotifications = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const user = await User.findById(req.user._id).lean();
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    const notifications = await buildUnifiedNotificationFeed(user, req.models);
    const sinLeer = notifications.filter((n) => !n.leida).length;

    res.json({ notifications, sinLeer });
});

// @desc    Marcar ítem como leído (DB o feed: news:/resource:/doc:)
// @route   PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
    const result = await markFeedItemRead(req.user._id, req.params.id, req.models);

    if (!result) {
        res.status(404);
        throw new Error('Notificación no encontrada');
    }

    if (result.reason === 'doc_pending') {
        res.status(400);
        throw new Error(
            'Este aviso es una documentación pendiente. Subila desde Comunicación → Documentación.',
        );
    }

    res.json({ ok: true, ...(result.notification || {}) });
});

// @desc    Marcar todas como leídas (DB + novedades + recursos vistos)
// @route   PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
    await markAllFeedRead(req.user._id, req.models);

    const { User } = req.models;
    const user = await User.findById(req.user._id).lean();
    const notifications = user
        ? await buildUnifiedNotificationFeed(user, req.models)
        : [];

    res.json({
        message: 'Notificaciones marcadas como leídas.',
        notifications,
        sinLeer: 0,
    });
});

// @desc    Eliminar u ocultar un ítem del feed
// @route   DELETE /api/notifications/:id
const dismissNotification = asyncHandler(async (req, res) => {
    const result = await dismissFeedItem(req.user._id, req.params.id, req.models);

    if (!result) {
        res.status(404);
        throw new Error('Notificación no encontrada');
    }

    const { User } = req.models;
    const user = await User.findById(req.user._id).lean();
    const notifications = user
        ? await buildUnifiedNotificationFeed(user, req.models)
        : [];
    const sinLeer = notifications.filter((n) => !n.leida).length;

    res.json({ ok: true, notifications, sinLeer });
});

// @desc    Eliminar todas las notificaciones visibles
// @route   DELETE /api/notifications
const dismissAllNotifications = asyncHandler(async (req, res) => {
    await dismissAllFeedItems(req.user._id, req.models);

    res.json({
        message: 'Notificaciones eliminadas.',
        notifications: [],
        sinLeer: 0,
    });
});

export { getMyNotifications, markAsRead, markAllAsRead, dismissNotification, dismissAllNotifications };
