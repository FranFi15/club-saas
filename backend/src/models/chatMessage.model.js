import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ChatConversation',
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
    },
    { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });

export const getChatMessageModel = (tenantDB) => {
    return tenantDB.models.ChatMessage || tenantDB.model('ChatMessage', chatMessageSchema);
};
