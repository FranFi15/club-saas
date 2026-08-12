/**
 * Chat grupal por categoría: profesores + preparadores + atletas activos.
 * Se crea/sincroniza cuando `chatGrupalCategoriaEnabled` está activo.
 */

function idStr(v) {
    return String(v?._id || v);
}

async function resolveMemberIds(models, category) {
    const { Enrollment, User } = models;
    const set = new Set();
    for (const id of category.profesores || []) set.add(idStr(id));
    for (const id of category.preparadoresFisicos || []) set.add(idStr(id));

    const athleteIds = await Enrollment.find({
        categoria: category._id,
        estado: 'activo',
    }).distinct('atleta');
    for (const id of athleteIds) set.add(idStr(id));

    if (!set.size) return [];

    const active = await User.find({
        _id: { $in: [...set] },
        estado: 'activo',
    })
        .select('_id')
        .lean();
    return active.map((u) => u._id);
}

/**
 * Crea o actualiza el grupo de la categoría.
 * Si el switch está off, desactiva el grupo (historial intacto).
 */
export async function syncCategoryGroupChat(models, categoryId) {
    const { Category, ChatConversation } = models;
    if (!Category || !ChatConversation || !categoryId) return null;

    const category = await Category.findById(categoryId)
        .select('nombre profesores preparadoresFisicos chatGrupalCategoriaEnabled')
        .lean();
    if (!category) return null;

    if (!category.chatGrupalCategoriaEnabled) {
        await ChatConversation.updateOne(
            { kind: 'category_group', category: category._id },
            { $set: { active: false } },
        );
        return null;
    }

    const participants = await resolveMemberIds(models, category);
    const title = (category.nombre || 'Categoría').trim();

    let conv = await ChatConversation.findOne({
        kind: 'category_group',
        category: category._id,
    });

    if (!conv) {
        if (!participants.length) return null;
        conv = await ChatConversation.create({
            kind: 'category_group',
            category: category._id,
            title,
            participants,
            active: true,
            lastMessageAt: new Date(),
            lastMessagePreview: '',
            unreadBy: {},
        });
        return conv;
    }

    conv.participants = participants;
    conv.title = title;
    conv.active = true;
    if (conv.pairKey) conv.pairKey = undefined;
    await conv.save();
    return conv;
}

/** Fire-and-forget seguro para no romper enroll/update. */
export async function syncCategoryGroupChatSafe(models, categoryId) {
    try {
        await syncCategoryGroupChat(models, categoryId);
    } catch (e) {
        console.warn('[chat group] sync:', e.message);
    }
}

export async function deactivateCategoryGroupChat(models, categoryId) {
    const { ChatConversation } = models;
    if (!ChatConversation || !categoryId) return;
    await ChatConversation.updateOne(
        { kind: 'category_group', category: categoryId },
        { $set: { active: false } },
    );
}
