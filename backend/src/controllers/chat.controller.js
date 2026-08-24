import asyncHandler from 'express-async-handler';
import {
    listConversations,
    getOrCreateConversation,
    listMessages,
    sendMessage,
    markConversationRead,
    listEligibleRecipients,
} from '../services/chat.service.js';
import {
    getStaffGroupChatSettings,
    setStaffGroupChatEnabled,
} from '../services/staffGroupChat.service.js';

function assertAdminChatSettings(req) {
    if (!['admin_club', 'administrativo'].includes(req.user?.rol)) {
        const err = new Error('Solo administración puede configurar el chat grupal del personal.');
        err.statusCode = 403;
        throw err;
    }
}

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

export const getStaffGroupSettings = asyncHandler(async (req, res) => {
    assertAdminChatSettings(req);
    res.json(await getStaffGroupChatSettings(req.models));
});

export const patchStaffGroupSettings = asyncHandler(async (req, res) => {
    assertAdminChatSettings(req);
    const enabled =
        req.body?.chatGrupalStaffEnabled === true || req.body?.chatGrupalStaffEnabled === 'true';
    await setStaffGroupChatEnabled(req.models, enabled);
    res.json({ chatGrupalStaffEnabled: enabled });
});
