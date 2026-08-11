import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getConversations,
    getRecipients,
    postConversation,
    getMessages,
    postMessage,
    postRead,
} from '../controllers/chat.controller.js';

const router = express.Router();

router.get('/conversations', protect, getConversations);
router.post('/conversations', protect, postConversation);
router.get('/recipients', protect, getRecipients);

router.get('/conversations/:id/messages', protect, getMessages);
router.post('/conversations/:id/messages', protect, postMessage);
router.post('/conversations/:id/read', protect, postRead);

export default router;
