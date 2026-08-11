import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: true, 
        trim: true 
    },
    // Referencia a la Disciplina (Básquet, Fútbol, etc.)
    disciplina: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Discipline',
        required: true
    },
    // Array de Profesores asignados a esta categoría
    profesores: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    preparadoresFisicos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    nutricionistas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    psicologos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    descripcion: { type: String, trim: true },
    edadMinima: { type: Number },
    edadMaxima: { type: Number },
    /** Varones, mujeres o ambos (plantel mixto / sin restricción). */
    sexo: { type: String, enum: ['M', 'F', 'ambos'], default: 'ambos' },
    // Plan de pago default que se asigna automáticamente al inscribir un atleta
    planDefault: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },

    /**
     * Si true, atletas de esta categoría pueden chatear con profesionales asignados a ella.
     * Pensado para categorías adultas; dejar off en infantiles (habla el tutor).
     */
    chatAtletaProfesionalEnabled: { type: Boolean, default: false },

    /** Si el admin delegó al profesor la actualización del plantel (inscripciones). */
    plantelEdicion: {
        estado: { type: String, enum: ['delegado_coach'] },
        solicitadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        solicitadoEn: { type: Date },
    },
}, { timestamps: true });

// Evitamos que en la misma disciplina existan dos categorías con el mismo nombre
categorySchema.index({ nombre: 1, disciplina: 1 }, { unique: true });

export const getCategoryModel = (tenantDB) => {
    return tenantDB.models.Category || tenantDB.model('Category', categorySchema);
};