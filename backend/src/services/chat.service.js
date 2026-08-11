import { sendPushToUserIds } from './pushNotification.service.js';
import {
    canChat,
    listEligibleRecipients,
    makePairKey,
} from './chatAccess.service.js';

const USER_SELECT = 'nombre apellido email rol fotoPerfil estado';

function idStr(v) {
    return String(v?._id || v);
}

function unreadFor(conv, userId) {
    if (!conv?.unreadBy) return 0;
    if (typeof conv.unreadBy.get === 'function') {
        return Number(conv.unreadBy.get(String(userId)) || 0);
    }
    return Number(conv.unreadBy[String(userId)] || 0);
}

function otherParticipant(conv, userId) {
    const me = String(userId);
    return (conv.participants || []).find((p) => String(p._id || p) !== me) || null;
}

export async function listConversations(models, user) {
    const { ChatConversation } = models;
    const rows = await ChatConversation.find({ participants: user._id })
        .sort({ lastMessageAt: -1 })
        .populate('participants', USER_SELECT)
        .lean({ flattenMaps: true });

    return rows.map((c) => {
        const other = otherParticipant(c, user._id);
        return {
            _id: c._id,
            otherUser: other,
            lastMessageAt: c.lastMessageAt,
            lastMessagePreview: c.lastMessagePreview || '',
            lastSender: c.lastSender,
            unread: unreadFor(c, user._id),
        };
    });
}

export async function getOrCreateConversation(models, user, otherUserId) {
    const { User, ChatConversation } = models;
    const other = await User.findById(otherUserId).select(USER_SELECT).lean();
    if (!other || other.estado !== 'activo') {
        const err = new Error('Usuario no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    const allowed = await canChat(models, user, other);
    if (!allowed) {
        const err = new Error('No podés iniciar un chat con este usuario.');
        err.statusCode = 403;
        throw err;
    }

    const pairKey = makePairKey(user._id, other._id);
    let conv = await ChatConversation.findOne({ pairKey }).populate('participants', USER_SELECT);
    if (!conv) {
        conv = await ChatConversation.create({
            participants: [user._id, other._id],
            pairKey,
            lastMessageAt: new Date(),
            lastMessagePreview: '',
            unreadBy: {},
        });
        conv = await ChatConversation.findById(conv._id).populate('participants', USER_SELECT);
    }

    const lean = conv.toObject({ flattenMaps: true });
    return {
        _id: lean._id,
        otherUser: otherParticipant(lean, user._id),
        lastMessageAt: lean.lastMessageAt,
        lastMessagePreview: lean.lastMessagePreview || '',
        lastSender: lean.lastSender,
        unread: unreadFor(lean, user._id),
    };
}

async function assertParticipant(models, conversationId, userId) {
    const { ChatConversation } = models;
    const conv = await ChatConversation.findById(conversationId);
    if (!conv) {
        const err = new Error('Conversación no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    const ok = (conv.participants || []).some((p) => String(p) === String(userId));
    if (!ok) {
        const err = new Error('No autorizado.');
        err.statusCode = 403;
        throw err;
    }
    return conv;
}

export async function listMessages(models, user, conversationId, { before, limit = 40 } = {}) {
    const { ChatMessage } = models;
    await assertParticipant(models, conversationId, user._id);

    const q = { conversation: conversationId };
    if (before) {
        const d = new Date(before);
        if (!Number.isNaN(d.getTime())) q.createdAt = { $lt: d };
    }

    const lim = Math.min(100, Math.max(1, Number(limit) || 40));
    const rows = await ChatMessage.find(q)
        .sort({ createdAt: -1 })
        .limit(lim)
        .populate('sender', USER_SELECT)
        .lean();

    return rows.reverse();
}

export async function sendMessage(models, user, conversationId, bodyRaw) {
    const { ChatConversation, ChatMessage } = models;
    const body = String(bodyRaw || '').trim();
    if (!body) {
        const err = new Error('El mensaje no puede estar vacío.');
        err.statusCode = 400;
        throw err;
    }
    if (body.length > 2000) {
        const err = new Error('El mensaje es demasiado largo.');
        err.statusCode = 400;
        throw err;
    }

    const conv = await assertParticipant(models, conversationId, user._id);
    const otherId = (conv.participants || []).find((p) => String(p) !== String(user._id));

    // Revalidar permiso (flag puede haberse desactivado)
    const { User } = models;
    const other = await User.findById(otherId).select(USER_SELECT).lean();
    if (!other || !(await canChat(models, user, other))) {
        const err = new Error('Ya no podés enviar mensajes en esta conversación.');
        err.statusCode = 403;
        throw err;
    }

    const msg = await ChatMessage.create({
        conversation: conv._id,
        sender: user._id,
        body,
    });

    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
    const otherKey = String(otherId);
    const prevUnread = unreadFor(conv, otherId);
    conv.lastMessageAt = msg.createdAt;
    conv.lastMessagePreview = preview;
    conv.lastSender = user._id;
    if (!conv.unreadBy) conv.unreadBy = new Map();
    conv.unreadBy.set(otherKey, prevUnread + 1);
    conv.unreadBy.set(String(user._id), 0);
    await conv.save();

    const populated = await ChatMessage.findById(msg._id).populate('sender', USER_SELECT).lean();

    const senderName = `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Mensaje nuevo';
    try {
        await sendPushToUserIds(models, [otherId], {
            title: senderName,
            body: preview,
            data: {
                tipo: 'chat',
                conversationId: String(conv._id),
                title: senderName,
                body: preview,
            },
        });
    } catch (e) {
        console.warn('[chat] push error:', e.message);
    }

    return populated;
}

export async function markConversationRead(models, user, conversationId) {
    const conv = await assertParticipant(models, conversationId, user._id);
    if (!conv.unreadBy) conv.unreadBy = new Map();
    conv.unreadBy.set(String(user._id), 0);
    await conv.save();
    return { ok: true };
}

export async function countUnreadChatForUser(models, userId) {
    const { ChatConversation } = models;
    if (!ChatConversation) return 0;
    const rows = await ChatConversation.find({ participants: userId })
        .select('unreadBy')
        .lean({ flattenMaps: true });
    let total = 0;
    for (const c of rows) {
        total += unreadFor(c, userId);
    }
    return total;
}

export { listEligibleRecipients };
