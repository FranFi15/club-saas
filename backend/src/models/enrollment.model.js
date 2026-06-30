import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
    atleta: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    categoria: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category', 
        required: true 
    },
    fechaInscripcion: { 
        type: Date, 
        default: Date.now 
    },
    aptoMedico: { 
        type: Boolean, 
        default: false 
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    descuentoPorcentaje: { 
        type: Number, 
        default: 0 
    },
    motivoDescuento: { 
        type: String, 
        trim: true
    },
    estado: { 
        type: String, 
        enum: ['activo', 'inactivo', 'lesionado'], 
        default: 'activo' 
    }
}, { timestamps: true });

// Índice para evitar que anoten al mismo pibe dos veces en la misma categoría
enrollmentSchema.index({ atleta: 1, categoria: 1 }, { unique: true });
enrollmentSchema.index({ categoria: 1, estado: 1 });
enrollmentSchema.index({ atleta: 1, estado: 1 });

export const getEnrollmentModel = (tenantDB) => {
    return tenantDB.models.Enrollment || tenantDB.model('Enrollment', enrollmentSchema);
};