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
        /** text | requirement | resource — drives chat UI chrome + CTA */
        kind: {
            type: String,
            enum: ['text', 'requirement', 'resource'],
            default: 'text',
        },
        action: {
            type: {
                type: String,
                enum: ['requirement', 'resource'],
            },
            requirementId: { type: mongoose.Schema.Types.ObjectId },
            resourceId: { type: mongoose.Schema.Types.ObjectId },
            label: { type: String, trim: true, maxlength: 80 },
            /** Archivo de referencia del pedido (para ver/descargar desde el chat). */
            fileUrl: { type: String, trim: true, maxlength: 2000 },
            fileName: { type: String, trim: true, maxlength: 200 },
        },
    },
    { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });

export const getChatMessageModel = (tenantDB) => {
    return tenantDB.models.ChatMessage || tenantDB.model('ChatMessage', chatMessageSchema);
};
