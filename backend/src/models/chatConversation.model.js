import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
    {
        kind: {
            type: String,
            enum: ['direct', 'category_group', 'staff_group'],
            default: 'direct',
        },
        /** Solo para `category_group`: una conversación por categoría. */
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },
        title: { type: String, default: '', trim: true },
        /** Si false (switch apagado), se mantiene el historial pero no se envían mensajes. */
        active: { type: Boolean, default: true },
        participants: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
            ],
            validate: {
                validator(v) {
                    if (!Array.isArray(v) || v.length < 1) return false;
                    if (this.kind === 'category_group' || this.kind === 'staff_group') return true;
                    return v.length === 2;
                },
                message: 'Participantes inválidos para este tipo de conversación.',
            },
        },
        /** Par ordenado "idA:idB" — solo DMs (`direct`). */
        pairKey: { type: String, default: undefined },
        lastMessageAt: { type: Date, default: Date.now },
        lastMessagePreview: { type: String, default: '' },
        lastSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        unreadBy: {
            type: Map,
            of: Number,
            default: {},
        },
    },
    { timestamps: true }
);

chatConversationSchema.index({ participants: 1, lastMessageAt: -1 });
/** Solo DMs con pairKey string — sparse + null colisionaba entre chats grupales. */
chatConversationSchema.index(
    { pairKey: 1 },
    {
        unique: true,
        name: 'pairKey_direct_unique',
        partialFilterExpression: { kind: 'direct', pairKey: { $type: 'string' } },
    }
);
chatConversationSchema.index(
    { category: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: { kind: 'category_group', category: { $type: 'objectId' } },
    }
);
chatConversationSchema.index(
    { kind: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'staff_group' },
    }
);

const pairKeyIndexEnsured = new WeakSet();

/**
 * Migra el índice legacy `pairKey_1` (sparse unique) que indexaba `pairKey: null`
 * y chocaba al crear más de un chat grupal.
 */
export async function ensureChatConversationPairKeyIndex(ChatConversation) {
    if (!ChatConversation?.collection || pairKeyIndexEnsured.has(ChatConversation.collection)) {
        return;
    }
    pairKeyIndexEnsured.add(ChatConversation.collection);

    try {
        await ChatConversation.updateMany(
            { kind: { $in: ['category_group', 'staff_group'] } },
            { $unset: { pairKey: 1 } },
        );
    } catch (e) {
        console.warn('[chat] unset group pairKey:', e.message);
    }

    try {
        const indexes = await ChatConversation.collection.indexes();
        const legacy = indexes.find((idx) => idx.name === 'pairKey_1');
        if (legacy) {
            await ChatConversation.collection.dropIndex('pairKey_1');
        }
    } catch (e) {
        if (e?.codeName !== 'IndexNotFound' && e?.code !== 27) {
            console.warn('[chat] drop legacy pairKey_1:', e.message);
        }
    }

    try {
        await ChatConversation.collection.createIndex(
            { pairKey: 1 },
            {
                unique: true,
                name: 'pairKey_direct_unique',
                partialFilterExpression: { kind: 'direct', pairKey: { $type: 'string' } },
            },
        );
    } catch (e) {
        // Index already exists with same options, or race — safe to ignore.
        if (e?.code !== 85 && e?.code !== 86) {
            console.warn('[chat] ensure pairKey index:', e.message);
        }
    }
}

export const getChatConversationModel = (tenantDB) => {
    return (
        tenantDB.models.ChatConversation ||
        tenantDB.model('ChatConversation', chatConversationSchema)
    );
};
