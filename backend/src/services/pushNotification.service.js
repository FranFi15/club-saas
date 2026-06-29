import axios from 'axios';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_TOKENS_PER_USER = 8;

function isExpoPushToken(token) {
    return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

export async function collectPushTokensForUsers(User, userIds) {
    const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return [];

    const users = await User.find({ _id: { $in: ids } }).select('expoPushTokens').lean();
    const tokens = new Set();
    for (const u of users) {
        for (const row of u.expoPushTokens || []) {
            if (row?.token && isExpoPushToken(row.token)) tokens.add(row.token);
        }
    }
    return [...tokens];
}

async function pruneInvalidTokens(User, invalidTokens) {
    if (!invalidTokens?.length) return;
    await User.updateMany(
        { 'expoPushTokens.token': { $in: invalidTokens } },
        { $pull: { expoPushTokens: { token: { $in: invalidTokens } } } },
    );
}

/** Envía push a uno o más usuarios (todos sus dispositivos registrados). */
export async function sendPushToUserIds(models, userIds, { title, body, data = {} }) {
    const { User } = models;
    const tokens = await collectPushTokensForUsers(User, userIds);
    if (!tokens.length) return { sent: 0 };

    const messages = tokens.map((to) => ({
        to,
        sound: 'default',
        title: String(title || 'Club'),
        body: String(body || ''),
        data: Object.fromEntries(
            Object.entries(data).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]),
        ),
        priority: 'high',
        channelId: 'default',
    }));

    let sent = 0;
    const invalid = new Set();

    for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        try {
            const { data: res } = await axios.post(EXPO_PUSH_URL, chunk, {
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                timeout: 15000,
            });
            const tickets = Array.isArray(res?.data) ? res.data : [res?.data].filter(Boolean);
            tickets.forEach((ticket, idx) => {
                if (ticket?.status === 'ok') sent += 1;
                if (ticket?.status === 'error') {
                    const detail = ticket?.details?.error;
                    if (detail === 'DeviceNotRegistered' && chunk[idx]?.to) {
                        invalid.add(chunk[idx].to);
                    }
                }
            });
        } catch (e) {
            console.warn('[push] Expo send error:', e.response?.data || e.message);
        }
    }

    if (invalid.size) {
        await pruneInvalidTokens(User, [...invalid]);
    }

    return { sent };
}

export async function registerUserPushToken(User, userId, { token, platform }) {
    if (!isExpoPushToken(token)) {
        const err = new Error('Token de notificación inválido.');
        err.statusCode = 400;
        throw err;
    }

    const user = await User.findById(userId);
    if (!user) {
        const err = new Error('Usuario no encontrado');
        err.statusCode = 404;
        throw err;
    }

    const now = new Date();
    const rows = (user.expoPushTokens || []).filter((r) => r.token !== token);
    rows.unshift({
        token,
        platform: platform || 'unknown',
        updatedAt: now,
    });
    user.expoPushTokens = rows.slice(0, MAX_TOKENS_PER_USER);
    await user.save();
    return user.expoPushTokens;
}

export async function unregisterUserPushToken(User, userId, token) {
    if (!token) return;
    await User.findByIdAndUpdate(userId, {
        $pull: { expoPushTokens: { token } },
    });
}
