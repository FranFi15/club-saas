import mongoose from 'mongoose';

/** Carpeta para agrupar pedidos de documentación en la pantalla de revisión. */
const requirementFolderSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        activo: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// 1. La Definición: ¿Qué pedimos?
const requirementSchema = new mongoose.Schema(
    {
        titulo: { type: String, required: true }, // Ej: "Apto Médico 2026"
        descripcion: { type: String },
        obligatorio: { type: Boolean, default: true },
        fechaVencimiento: { type: Date }, // Fecha límite para subirlo

        // A quién se lo pedimos
        alcance: { type: String, enum: ['global', 'categoria', 'usuario'], required: true },
        targetCategoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        targetUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

        /** Archivo de referencia (plantilla / ejemplo) que el atleta puede descargar. */
        archivoAdjuntoUrl: { type: String, default: '', trim: true },
        archivoAdjuntoNombre: { type: String, default: '', trim: true },

        /** Carpeta opcional; null = Sin carpeta. */
        carpeta: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'RequirementFolder',
            default: null,
        },

        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

        activo: { type: Boolean, default: true },
    },
    { timestamps: true },
);

requirementSchema.index({ carpeta: 1, activo: 1 });
requirementSchema.index({ creadoPor: 1, activo: 1 });

// 2. La Entrega: El documento del pibe
const submissionSchema = new mongoose.Schema(
    {
        requerimiento: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', required: true },
        atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        fileUrl: { type: String, required: true },

        estado: {
            type: String,
            enum: ['pendiente', 'revision', 'aprobado', 'rechazado'],
            default: 'revision',
        },
        motivoRechazo: { type: String }, // "La foto está borrosa"
        revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fechaRevision: { type: Date },
    },
    { timestamps: true },
);

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

export const getRequirementFolderModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'RequirementFolder', requirementFolderSchema, ['nombre']);

export const getRequirementModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'Requirement', requirementSchema, ['carpeta']);

export const getSubmissionModel = (tenantDB) =>
    getOrCompileModel(tenantDB, 'Submission', submissionSchema);
