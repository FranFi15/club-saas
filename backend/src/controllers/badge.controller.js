import asyncHandler from 'express-async-handler';
import { buildBadgeSummary } from '../services/badgeCounts.service.js';

// @desc    Resumen de badges por rol (tabs, hubs, notificaciones)
// @route   GET /api/badges/summary
const getBadgeSummary = asyncHandler(async (req, res) => {
    const summary = await buildBadgeSummary(req);
    res.json(summary);
});

// @desc    Marcar novedades o recursos como vistos
// @route   PATCH /api/badges/seen
const markContentSeen = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const { news, resources } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    const now = new Date();
    if (news === true || news === 'true') {
        user.lastSeenNewsAt = now;
    }
    if (resources === true || resources === 'true') {
        user.lastSeenResourcesAt = now;
    }

    await user.save();
    const summary = await buildBadgeSummary(req);
    res.json(summary);
});

export { getBadgeSummary, markContentSeen };
