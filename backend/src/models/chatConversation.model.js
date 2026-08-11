import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
    {
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
                    return Array.isArray(v) && v.length === 2;
                },
                message: 'Una conversación debe tener exactamente 2 participantes.',
            },
        },
        /** Par ordenado "idA:idB" para unicidad 1:1 */
        pairKey: { type: String, required: true, unique: true, index: true },
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

export const getChatConversationModel = (tenantDB) => {
    return (
        tenantDB.models.ChatConversation ||
        tenantDB.model('ChatConversation', chatConversationSchema)
    );
};
