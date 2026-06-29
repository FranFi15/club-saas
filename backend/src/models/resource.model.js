import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String },
    fileUrl: { type: String, required: true }, // Link al PDF/Imagen en la nube
    
    // Clasificación para que el atleta encuentre todo rápido
    tipo: { 
        type: String, 
        enum: ['rutina', 'nutricion', 'estudio_medico', 'tactico', 'otro'], 
        required: true 
    },

    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // A quién pertenece este recurso
    alcance: { 
        type: String, 
        enum: ['categoria', 'usuario'], 
        required: true 
    },
    targetCategoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    targetUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    fechaExpiracion: { type: Date } // Opcional: para que una rutina se "vence" sola
}, { timestamps: true });

export const getResourceModel = (tenantDB) => {
    return tenantDB.models.Resource || tenantDB.model('Resource', resourceSchema);
};