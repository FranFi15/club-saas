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

export const COURT_TIPOS_MEDICION = ['porcentaje', 'tiempo', 'total'];

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
        /** What athletes log per pin: hit%, elapsed time, or a single total. */
        tipoMedicion: {
            type: String,
            enum: COURT_TIPOS_MEDICION,
            default: 'porcentaje',
        },
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
        tipoMedicion: {
            type: String,
            enum: COURT_TIPOS_MEDICION,
            default: 'porcentaje',
        },
        aciertos: { type: Number, default: null, min: 0 },
        intentos: { type: Number, default: null, min: 0 },
        porcentaje: { type: Number, default: null, min: 0, max: 100 },
        /** Elapsed time for tiempo metrics (seconds). */
        tiempoSegundos: { type: Number, default: null, min: 0 },
        /** Single total value for total metrics. */
        valorTotal: { type: Number, default: null, min: 0 },
        fecha: { type: Date, default: Date.now },
        notasExtra: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

courtMetricResultSchema.index({ metric: 1, atleta: 1, fecha: -1 });
courtMetricResultSchema.index({ run: 1, pinId: 1 });

/** Re-register when schema gained paths (long-lived tenant connections). */
function getOrCompileModel(tenantDB, name, schema, requiredPaths = []) {
    const existing = tenantDB.models[name];
    if (existing) {
        const missing = requiredPaths.some((p) => !existing.schema.path(p));
        if (!missing) return existing;
        delete tenantDB.models[name];
        if (tenantDB.modelSchemas) delete tenantDB.modelSchemas[name];
    }
    return tenantDB.model(name, schema);
}

export const getCourtMetricModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'CourtMetric', courtMetricSchema, ['tipoMedicion']);

export const getCourtMetricRunModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'CourtMetricRun', courtMetricRunSchema);

export const getCourtMetricResultModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'CourtMetricResult', courtMetricResultSchema, [
        'tipoMedicion',
        'tiempoSegundos',
        'valorTotal',
    ]);
