import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getConversations,
    getRecipients,
    postConversation,
    getMessages,
    postMessage,
    postRead,
    getStaffGroupSettings,
    patchStaffGroupSettings,
} from '../controllers/chat.controller.js';

const router = express.Router();

router.get('/staff-group/settings', protect, getStaffGroupSettings);
router.patch('/staff-group/settings', protect, patchStaffGroupSettings);

router.get('/conversations', protect, getConversations);
router.post('/conversations', protect, postConversation);
router.get('/recipients', protect, getRecipients);

router.get('/conversations/:id/messages', protect, getMessages);
router.post('/conversations/:id/messages', protect, postMessage);
router.post('/conversations/:id/read', protect, postRead);

export default router;
