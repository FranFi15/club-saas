import mongoose from 'mongoose';

const wellnessSchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, default: Date.now },
    tipo: { type: String, enum: ['pre', 'post'], required: true },
    /** Opcional en pre (referencia). Obligatorio en post (RPE de esa sesión). */
    sesion: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },

    sueno: { type: Number, min: 1, max: 10 },
    estres: { type: Number, min: 1, max: 10 },
    fatiga: { type: Number, min: 1, max: 10 },
    dolorMuscular: { type: Number, min: 1, max: 10 },

    rpe: { type: Number, min: 1, max: 10 },
}, { timestamps: true });

// Un RPE (post) por atleta y sesión
wellnessSchema.index(
    { atleta: 1, sesion: 1, tipo: 1 },
    { unique: true, partialFilterExpression: { tipo: 'post', sesion: { $type: 'objectId' } } },
);

export const getWellnessModel = (tenantDB) => {
    return tenantDB.models.Wellness || tenantDB.model('Wellness', wellnessSchema);
};
