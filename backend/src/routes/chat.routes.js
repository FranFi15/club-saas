import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import {
    getSettings,
    patchSettings,
    getConversations,
    getRecipients,
    postConversation,
    getMessages,
    postMessage,
    postRead,
} from '../controllers/chat.controller.js';

const router = express.Router();

router.get('/settings', protect, getSettings);
router.patch('/settings', protect, authorize('admin_club', 'administrativo'), patchSettings);

router.get('/conversations', protect, getConversations);
router.post('/conversations', protect, postConversation);
router.get('/recipients', protect, getRecipients);

router.get('/conversations/:id/messages', protect, getMessages);
router.post('/conversations/:id/messages', protect, postMessage);
router.post('/conversations/:id/read', protect, postRead);

export default router;
