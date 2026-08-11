import asyncHandler from 'express-async-handler';
import {
    listConversations,
    getOrCreateConversation,
    listMessages,
    sendMessage,
    markConversationRead,
    listEligibleRecipients,
} from '../services/chat.service.js';

export const getConversations = asyncHandler(async (req, res) => {
    res.json(await listConversations(req.models, req.user));
});

export const getRecipients = asyncHandler(async (req, res) => {
    res.json(await listEligibleRecipients(req.models, req.user));
});

export const postConversation = asyncHandler(async (req, res) => {
    const userId = req.body?.userId;
    if (!userId) {
        res.status(400);
        throw new Error('userId es requerido.');
    }
    res.status(201).json(await getOrCreateConversation(req.models, req.user, userId));
});

export const getMessages = asyncHandler(async (req, res) => {
    res.json(
        await listMessages(req.models, req.user, req.params.id, {
            before: req.query.before,
            limit: req.query.limit,
        }),
    );
});

export const postMessage = asyncHandler(async (req, res) => {
    const msg = await sendMessage(req.models, req.user, req.params.id, req.body?.body);
    res.status(201).json(msg);
});

export const postRead = asyncHandler(async (req, res) => {
    res.json(await markConversationRead(req.models, req.user, req.params.id));
});
