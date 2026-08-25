/**
 * Chat grupal del personal del club (administración, operaciones y cuerpo técnico).
 * Se crea/sincroniza cuando `chatGrupalStaffEnabled` está activo en ClubSettings.
 */

import { getOrCreateClubSettings } from './familyDiscount.service.js';
import { PAYROLL_STAFF_ROLES } from '../models/payroll.model.js';

const STAFF_GROUP_TITLE = 'Personal del club';

async function resolveStaffMemberIds(models) {
    const { User } = models;
    const active = await User.find({
        rol: { $in: PAYROLL_STAFF_ROLES },
        estado: { $ne: 'inactivo' },
    })
        .select('_id')
        .lean();
    return active.map((u) => u._id);
}

async function isStaffGroupEnabled(models) {
    const { ClubSettings } = models;
    if (!ClubSettings) return false;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return Boolean(doc.chatGrupalStaffEnabled);
}

/**
 * Crea o actualiza el grupo de personal.
 * Si el switch está off, desactiva el grupo (historial intacto).
 */
export async function syncStaffGroupChat(models, { forceEnabled } = {}) {
    const { ChatConversation } = models;
    if (!ChatConversation) return null;

    const enabled =
        forceEnabled !== undefined ? !!forceEnabled : await isStaffGroupEnabled(models);

    if (!enabled) {
        await ChatConversation.updateOne({ kind: 'staff_group' }, { $set: { active: false } });
        return null;
    }

    const participants = await resolveStaffMemberIds(models);

    let conv = await ChatConversation.findOne({ kind: 'staff_group' });

    if (!conv) {
        if (!participants.length) return null;
        conv = await ChatConversation.create({
            kind: 'staff_group',
            title: STAFF_GROUP_TITLE,
            participants,
            active: true,
            lastMessageAt: new Date(),
            lastMessagePreview: '',
            unreadBy: {},
        });
        return conv;
    }

    conv.participants = participants;
    conv.title = STAFF_GROUP_TITLE;
    conv.active = true;
    if (conv.pairKey) conv.pairKey = undefined;
    if (conv.category) conv.category = undefined;
    await conv.save();
    return conv;
}

export async function syncStaffGroupChatSafe(models) {
    try {
        await syncStaffGroupChat(models);
    } catch (e) {
        console.warn('[chat staff group] sync:', e.message);
    }
}

export async function setStaffGroupChatEnabled(models, enabled) {
    const { ClubSettings } = models;
    const on = !!enabled;
    await getOrCreateClubSettings(ClubSettings);
    await ClubSettings.findOneAndUpdate({}, { chatGrupalStaffEnabled: on }, { upsert: true });
    return syncStaffGroupChat(models, { forceEnabled: on });
}

export async function getStaffGroupChatSettings(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return { chatGrupalStaffEnabled: Boolean(doc.chatGrupalStaffEnabled) };
}

export { STAFF_GROUP_TITLE, isStaffGroupEnabled };
