import asyncHandler from 'express-async-handler';
import { buildClubStats } from '../services/clubStats.service.js';

// @desc    Panel de estadísticas del club (demografía + ops + finanzas)
// @route   GET /api/stats/club
// @access  admin_club, administrativo
const getClubStats = asyncHandler(async (req, res) => {
    const stats = await buildClubStats(req.models, req.user._id);
    res.json(stats);
});

export { getClubStats };
