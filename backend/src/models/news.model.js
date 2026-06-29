import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    contenido: { type: String, required: true },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Para ponerle colorcito en el frontend (Ej: Urgente en rojo)
    tipo: { 
        type: String, 
        enum: ['general', 'urgente', 'deportivo', 'salud'], 
        default: 'general' 
    },

    // ¿A quién va dirigido el mensaje?
    alcance: { 
        type: String, 
        enum: ['global', 'rol', 'categoria', 'usuario', 'tutor'], 
        required: true 
    },

    // Dependiendo del alcance, uno de estos arrays va a tener datos
    targetRoles: [{ type: String }], // Ej: ['profe', 'administrativo']
    targetCategorias: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    targetUsuarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Multimedia (foto subida a Cloudinary)
    imagen: {
        url: { type: String },
        publicId: { type: String }
    }
    
}, { timestamps: true });

export const getNewsModel = (tenantDB) => {
    return tenantDB.models.News || tenantDB.model('News', newsSchema);
};