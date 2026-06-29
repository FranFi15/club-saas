import mongoose from 'mongoose';

const disciplineSchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: true, 
        trim: true,
        unique: true 
    },
    descripcion: { type: String, trim: true },
    coordinador: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    estado: { 
        type: String, 
        enum: ['activa', 'inactiva'], 
        default: 'activa' 
    },
    // Plan de pago default (fallback si la categoría no tiene planDefault)
    planDefault: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }
}, { timestamps: true });

export const getDisciplineModel = (tenantDB) => {
    return tenantDB.models.Discipline || tenantDB.model('Discipline', disciplineSchema);
};