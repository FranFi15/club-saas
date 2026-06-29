import mongoose from 'mongoose';

const spaceSchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: true, 
        trim: true,
        unique: true
    },
    tipo: { 
        type: String, 
        enum: ['cancha', 'gimnasio', 'pileta', 'salon', 'otro'], 
        default: 'cancha' 
    },
    admiteSubdivision: { 
        type: Boolean, 
        default: false 
    },
    estado: { 
        type: String, 
        enum: ['disponible', 'mantenimiento', 'clausurado'], 
        default: 'disponible' 
    },
    notasMantenimiento: { 
        type: String 
    },
    /** Último día inclusive en mantenimiento/clausurado (fin del día UTC). */
    indisponibleHasta: {
        type: Date,
    },
}, { timestamps: true });

export const getSpaceModel = (tenantDB) => {
    return tenantDB.models.Space || tenantDB.model('Space', spaceSchema);
};