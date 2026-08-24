import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
    {
        kind: {
            type: String,
            enum: ['direct', 'category_group', 'staff_group'],
            default: 'direct',
            index: true,
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
chatConversationSchema.index({ pairKey: 1 }, { unique: true, sparse: true });
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

export const getChatConversationModel = (tenantDB) => {
    return (
        tenantDB.models.ChatConversation ||
        tenantDB.model('ChatConversation', chatConversationSchema)
    );
};
