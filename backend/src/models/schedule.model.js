import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
    categoria: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category', 
        required: true 
    },
    diaSemana: { 
        type: String, 
        enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], 
        required: true 
    },
    horaInicio: { 
        type: String, // Formato "HH:mm" ej: "18:30"
        required: true 
    },
    horaFin: { 
        type: String, // Formato "HH:mm" ej: "20:00"
        required: true 
    },
    espacio: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Space', 
        required: true 
    },
    /** Hasta qué fecha (inclusive) el cron crea sesiones para este horario. */
    vigenteHasta: { type: Date, required: true },
}, { timestamps: true });

// Índice para evitar que una categoría tenga el mismo horario duplicado
scheduleSchema.index({ categoria: 1, diaSemana: 1, horaInicio: 1 }, { unique: true });

export const getScheduleModel = (tenantDB) => {
    return tenantDB.models.Schedule || tenantDB.model('Schedule', scheduleSchema);
};