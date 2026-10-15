import mongoose from 'mongoose';

export const COURT_DEPORTES = [
    'futbol',
    'basquet',
    'voley',
    'rugby',
    'hockey_cesped',
    'natacion',
    'otro',
];

const pinSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        x: { type: Number, required: true, min: 0, max: 1 },
        y: { type: Number, required: true, min: 0, max: 1 },
        notas: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const courtMetricSchema = new mongoose.Schema(
    {
        titulo: { type: String, required: true, trim: true },
        deporte: { type: String, enum: COURT_DEPORTES, required: true },
        /** Cloudinary URL or preset key e.g. preset:basquet */
        imagenUrl: { type: String, required: true, trim: true },
        imagenPublicId: { type: String, trim: true },
        pines: { type: [pinSchema], default: [] },
        categorias: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
        atletas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        creador: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        estado: { type: String, enum: ['activa', 'archivada'], default: 'activa' },
    },
    { timestamps: true },
);

const courtMetricRunSchema = new mongoose.Schema(
    {
        metric: { type: mongoose.Schema.Types.ObjectId, ref: 'CourtMetric', required: true },
        atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        usaReloj: { type: Boolean, default: false },
        iniciadoEn: { type: Date },
        finalizadoEn: { type: Date },
        duracionSegundos: { type: Number, default: null },
        estado: {
            type: String,
            enum: ['en_curso', 'finalizada', 'cancelada'],
            default: 'en_curso',
        },
    },
    { timestamps: true },
);

courtMetricRunSchema.index({ metric: 1, atleta: 1, estado: 1 });

const courtMetricResultSchema = new mongoose.Schema(
    {
        run: { type: mongoose.Schema.Types.ObjectId, ref: 'CourtMetricRun', required: true },
        metric: { type: mongoose.Schema.Types.ObjectId, ref: 'CourtMetric', required: true },
        pinId: { type: mongoose.Schema.Types.ObjectId, required: true },
        atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        aciertos: { type: Number, required: true, min: 0 },
        intentos: { type: Number, required: true, min: 0 },
        porcentaje: { type: Number, required: true, min: 0, max: 100 },
        fecha: { type: Date, default: Date.now },
        notasExtra: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

courtMetricResultSchema.index({ metric: 1, atleta: 1, fecha: -1 });
courtMetricResultSchema.index({ run: 1, pinId: 1 });

export const getCourtMetricModel = (tenantDB) =>
    tenantDB.models.CourtMetric || tenantDB.model('CourtMetric', courtMetricSchema);

export const getCourtMetricRunModel = (tenantDB) =>
    tenantDB.models.CourtMetricRun || tenantDB.model('CourtMetricRun', courtMetricRunSchema);

export const getCourtMetricResultModel = (tenantDB) =>
    tenantDB.models.CourtMetricResult ||
    tenantDB.model('CourtMetricResult', courtMetricResultSchema);
