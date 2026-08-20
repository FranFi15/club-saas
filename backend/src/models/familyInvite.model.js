import mongoose from 'mongoose';

const athleteSlotSchema = new mongoose.Schema(
    {
        disciplina: { type: mongoose.Schema.Types.ObjectId, ref: 'Discipline', required: true },
        categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    },
    { _id: true },
);

const familyInviteSchema = new mongoose.Schema(
    {
        token: { type: String, required: true, unique: true, index: true },
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        estado: {
            type: String,
            enum: ['pendiente', 'completada', 'cancelada'],
            default: 'pendiente',
            index: true,
        },
        expiresAt: { type: Date, required: true, index: true },
        /** 0 = solo atletas (mayores / sin tutor); 1 = familia con tutor. */
        tutorCount: { type: Number, default: 1, min: 0, max: 2 },
        athleteSlots: {
            type: [athleteSlotSchema],
            validate: {
                validator(v) {
                    return Array.isArray(v) && v.length >= 1 && v.length <= 10;
                },
                message: 'La invitación debe tener entre 1 y 10 atletas.',
            },
        },
        notas: { type: String, trim: true, default: '' },
        completedAt: { type: Date },
        tutorCreado: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        atletasCreados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    { timestamps: true },
);

export const getFamilyInviteModel = (tenantDB) =>
    tenantDB.models.FamilyInvite || tenantDB.model('FamilyInvite', familyInviteSchema);
