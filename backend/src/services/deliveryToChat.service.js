import { canChat } from './chatAccess.service.js';
import { getOrCreateConversation, sendMessage } from './chat.service.js';
import { syncCategoryGroupChat } from './categoryGroupChat.service.js';

function idStr(v) {
    return String(v?._id || v);
}

function clip(text, max = 1800) {
    const t = String(text || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
}

function formatDueDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

export function buildRequirementChatBody(requirement, { athleteName } = {}) {
    const lines = ['Pedido de documentación'];
    if (athleteName) lines.push(`Para: ${athleteName}`);
    lines.push(requirement.titulo || 'Documento');
    if (requirement.descripcion?.trim()) lines.push(requirement.descripcion.trim());
    const due = formatDueDate(requirement.fechaVencimiento);
    if (due) lines.push(`Vence: ${due}`);
    return clip(lines.join('\n'));
}

export function buildResourceChatBody(resource, sender, { athleteName } = {}) {
    const who = `${sender?.nombre || ''} ${sender?.apellido || ''}`.trim() || 'El club';
    const lines = ['Nuevo material'];
    if (athleteName) lines.push(`Para: ${athleteName}`);
    lines.push(`${who} compartió: ${resource.titulo || 'Recurso'}`);
    if (resource.descripcion?.trim()) lines.push(resource.descripcion.trim());
    return clip(lines.join('\n'));
}

function requirementMeta(requirement) {
    return {
        kind: 'requirement',
        action: {
            type: 'requirement',
            requirementId: requirement._id,
            label: 'Ir a Documentación',
        },
    };
}

function resourceMeta(resource) {
    return {
        kind: 'resource',
        action: {
            type: 'resource',
            resourceId: resource._id,
            label: 'Ver material',
        },
    };
}

async function ensureGroupParticipant(models, conversationId, userId) {
    const { ChatConversation } = models;
    await ChatConversation.updateOne(
        { _id: conversationId },
        { $addToSet: { participants: userId } },
    );
}

async function sendDirect(models, sender, recipientId, body, meta) {
    const conv = await getOrCreateConversation(models, sender, recipientId);
    await sendMessage(models, sender, conv._id, body, meta);
    return { ok: true, mode: 'direct', to: idStr(recipientId) };
}

/**
 * Atleta: chat 1:1 si está habilitado; si no, tutor.
 * Otros roles (admin → persona): chat directo si canChat.
 */
export async function deliverToUserOrTutor(models, sender, recipient, bodyForRecipient, bodyForTutor, meta) {
    const { User } = models;
    if (!recipient || recipient.estado === 'inactivo') {
        return { ok: false, reason: 'inactive' };
    }

    if (recipient.rol === 'atleta') {
        if (await canChat(models, sender, recipient)) {
            try {
                return await sendDirect(models, sender, recipient._id, bodyForRecipient, meta);
            } catch (e) {
                console.warn('[deliveryToChat] direct athlete:', e.message);
            }
        }

        const tutorId = recipient.tutorPrincipal;
        if (tutorId) {
            const tutor = await User.findById(tutorId).select('nombre apellido rol estado').lean();
            if (tutor && tutor.estado === 'activo' && (await canChat(models, sender, tutor))) {
                try {
                    const athleteName =
                        `${recipient.nombre || ''} ${recipient.apellido || ''}`.trim() || 'el atleta';
                    const body =
                        typeof bodyForTutor === 'function'
                            ? bodyForTutor(athleteName)
                            : bodyForTutor || bodyForRecipient;
                    return await sendDirect(models, sender, tutor._id, body, meta);
                } catch (e) {
                    console.warn('[deliveryToChat] tutor fallback:', e.message);
                }
            }
        }
        return { ok: false, reason: 'no_chat_path' };
    }

    if (await canChat(models, sender, recipient)) {
        try {
            return await sendDirect(models, sender, recipient._id, bodyForRecipient, meta);
        } catch (e) {
            console.warn('[deliveryToChat] direct user:', e.message);
            return { ok: false, reason: e.message };
        }
    }
    return { ok: false, reason: 'no_chat_path' };
}

async function fanOutAthletes(models, sender, athleteIds, buildBodies, meta) {
    const { User } = models;
    const results = [];
    if (!athleteIds?.length) return results;

    const athletes = await User.find({
        _id: { $in: athleteIds },
        rol: 'atleta',
        estado: 'activo',
    })
        .select('nombre apellido rol estado tutorPrincipal')
        .lean();

    for (const athlete of athletes) {
        const athleteName = `${athlete.nombre || ''} ${athlete.apellido || ''}`.trim() || 'el atleta';
        const { bodyDirect, bodyTutor } = buildBodies(athleteName);
        // eslint-disable-next-line no-await-in-loop
        const r = await deliverToUserOrTutor(models, sender, athlete, bodyDirect, bodyTutor, meta);
        results.push({ athleteId: idStr(athlete._id), ...r });
    }
    return results;
}

async function tryCategoryGroup(models, sender, categoryId, body, meta) {
    const { Category, ChatConversation } = models;
    const category = await Category.findById(categoryId)
        .select('nombre chatGrupalCategoriaEnabled')
        .lean();
    if (!category?.chatGrupalCategoriaEnabled) {
        return { ok: false, reason: 'group_disabled' };
    }

    let conv = await syncCategoryGroupChat(models, categoryId);
    if (!conv) {
        conv = await ChatConversation.findOne({
            kind: 'category_group',
            category: categoryId,
            active: true,
        });
    }
    if (!conv || conv.active === false) {
        return { ok: false, reason: 'group_unavailable' };
    }

    const isParticipant = (conv.participants || []).some((p) => idStr(p) === idStr(sender._id));
    if (!isParticipant) {
        await ensureGroupParticipant(models, conv._id, sender._id);
    }

    try {
        await sendMessage(models, sender, conv._id, body, meta);
        return { ok: true, mode: 'group', conversationId: idStr(conv._id) };
    } catch (e) {
        console.warn('[deliveryToChat] group send:', e.message);
        return { ok: false, reason: e.message };
    }
}

/**
 * Entrega un pedido de documentación por chat según alcance.
 */
export async function deliverRequirementToChat(models, sender, requirement) {
    const { User, Enrollment } = models;
    const results = { mode: requirement.alcance, deliveries: [], viaNewsFallback: false };
    const meta = requirementMeta(requirement);

    if (requirement.alcance === 'usuario' && requirement.targetUsuario) {
        const person = await User.findById(requirement.targetUsuario)
            .select('nombre apellido rol estado tutorPrincipal')
            .lean();
        if (!person) return results;

        const athleteName =
            person.rol === 'atleta'
                ? `${person.nombre || ''} ${person.apellido || ''}`.trim()
                : '';
        const bodyDirect = buildRequirementChatBody(requirement);
        const bodyTutor = (name) => buildRequirementChatBody(requirement, { athleteName: name });
        const r = await deliverToUserOrTutor(
            models,
            sender,
            person,
            athleteName ? buildRequirementChatBody(requirement) : bodyDirect,
            bodyTutor,
            meta,
        );
        results.deliveries.push(r);
        return results;
    }

    if (requirement.alcance === 'categoria' && requirement.targetCategoria) {
        const bodyGroup = buildRequirementChatBody(requirement);
        const group = await tryCategoryGroup(
            models,
            sender,
            requirement.targetCategoria,
            bodyGroup,
            meta,
        );
        if (group.ok) {
            results.deliveries.push(group);
            return results;
        }

        const athleteIds = await Enrollment.find({
            categoria: requirement.targetCategoria,
            estado: 'activo',
        }).distinct('atleta');
        const fan = await fanOutAthletes(
            models,
            sender,
            athleteIds,
            (athleteName) => ({
                bodyDirect: buildRequirementChatBody(requirement),
                bodyTutor: buildRequirementChatBody(requirement, { athleteName }),
            }),
            meta,
        );
        results.deliveries.push(...fan);
        return results;
    }

    if (requirement.alcance === 'global') {
        const athleteIds = await User.find({ rol: 'atleta', estado: 'activo' }).distinct('_id');
        const fan = await fanOutAthletes(
            models,
            sender,
            athleteIds,
            (athleteName) => ({
                bodyDirect: buildRequirementChatBody(requirement),
                bodyTutor: buildRequirementChatBody(requirement, { athleteName }),
            }),
            meta,
        );
        results.deliveries.push(...fan);
        return results;
    }

    return results;
}

/**
 * Entrega un recurso multimedia por chat según alcance.
 */
export async function deliverResourceToChat(models, sender, resource) {
    const { User, Enrollment } = models;
    const results = { mode: resource.alcance, deliveries: [] };
    const meta = resourceMeta(resource);

    if (resource.alcance === 'usuario' && resource.targetUsuario) {
        const person = await User.findById(resource.targetUsuario)
            .select('nombre apellido rol estado tutorPrincipal')
            .lean();
        if (!person) return results;

        const r = await deliverToUserOrTutor(
            models,
            sender,
            person,
            buildResourceChatBody(resource, sender),
            (athleteName) => buildResourceChatBody(resource, sender, { athleteName }),
            meta,
        );
        results.deliveries.push(r);
        return results;
    }

    if (resource.alcance === 'categoria' && resource.targetCategoria) {
        const bodyGroup = buildResourceChatBody(resource, sender);
        const group = await tryCategoryGroup(
            models,
            sender,
            resource.targetCategoria,
            bodyGroup,
            meta,
        );
        if (group.ok) {
            results.deliveries.push(group);
            return results;
        }

        const athleteIds = await Enrollment.find({
            categoria: resource.targetCategoria,
            estado: 'activo',
        }).distinct('atleta');
        const fan = await fanOutAthletes(
            models,
            sender,
            athleteIds,
            (athleteName) => ({
                bodyDirect: buildResourceChatBody(resource, sender),
                bodyTutor: buildResourceChatBody(resource, sender, { athleteName }),
            }),
            meta,
        );
        results.deliveries.push(...fan);
        return results;
    }

    return results;
}

export function countSuccessfulDeliveries(results) {
    return (results?.deliveries || []).filter((d) => d?.ok).length;
}
