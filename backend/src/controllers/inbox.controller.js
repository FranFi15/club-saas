import asyncHandler from 'express-async-handler';
import { listAdminPendingInbox } from '../services/pendingInbox.service.js';

export const getPendingInbox = asyncHandler(async (req, res) => {
    const items = await listAdminPendingInbox(req.models, req.user._id);
    res.json({ items });
});
