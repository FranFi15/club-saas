import mongoose from 'mongoose';

// 1. La Definición: ¿Qué pedimos?
const requirementSchema = new mongoose.Schema({
    titulo: { type: String, required: true }, // Ej: "Apto Médico 2026"
    descripcion: { type: String },
    obligatorio: { type: Boolean, default: true },
    fechaVencimiento: { type: Date }, // Fecha límite para subirlo
    
    // A quién se lo pedimos
    alcance: { type: String, enum: ['global', 'categoria', 'usuario'], required: true },
    targetCategoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    targetUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    activo: { type: Boolean, default: true }
}, { timestamps: true });

// 2. La Entrega: El documento del pibe
const submissionSchema = new mongoose.Schema({
    requerimiento: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', required: true },
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileUrl: { type: String, required: true },
    
    estado: { 
        type: String, 
        enum: ['pendiente', 'revision', 'aprobado', 'rechazado'], 
        default: 'revision' 
    },
    motivoRechazo: { type: String }, // "La foto está borrosa"
    revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fechaRevision: { type: Date }
}, { timestamps: true });

export const getRequirementModel = (tenantDB) => tenantDB.models.Requirement || tenantDB.model('Requirement', requirementSchema);
export const getSubmissionModel = (tenantDB) => tenantDB.models.Submission || tenantDB.model('Submission', submissionSchema);