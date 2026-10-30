import mongoose from 'mongoose';

const campoSchema = new mongoose.Schema(
    {
        etiqueta: { type: String, required: true, trim: true, maxlength: 80 },
        alcance: { type: String, enum: ['partido', 'persona'], default: 'persona' },
        tipo: {
            type: String,
            enum: ['numero', 'texto', 'si_no', 'porcentaje', 'total', 'limite'],
            required: true,
        },
        iconoAnoto: { type: String, default: 'circulo' },
        iconoErro: { type: String, default: 'x' },
        camposTotal: [{ type: String }],
        limite: { type: Number, min: 1, max: 99, default: 5 },
        puntos: { type: Number, min: 0, max: 99, default: 0 },
    },
    { _id: true },
);

const matchSheetSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true, maxlength: 80 },
        cancha: {
            deporte: { type: String, default: 'basquet' },
            imagenUrl: { type: String, default: 'preset:basquet' },
        },
        reloj: {
            activo: { type: Boolean, default: true },
            periodos: { type: Number, default: 4 },
            minutosPorPeriodo: { type: Number, default: 10 },
            jugadoresEnCancha: { type: Number, default: 5 },
            posesion: { type: Boolean, default: true },
        },
        rival: {
            activo: { type: Boolean, default: false },
            modo: { type: String, enum: ['general', 'alineacion'], default: 'general' },
        },
        campos: { type: [campoSchema], default: [] },
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

export const getMatchSheetModel = (tenantDB) =>
    tenantDB.models.MatchSheet || tenantDB.model('MatchSheet', matchSheetSchema);
