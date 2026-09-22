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
    /** Desde qué fecha (inclusive) el cron crea sesiones para este horario. */
    vigenteDesde: { type: Date, default: null },
    /** Hasta qué fecha (inclusive) el cron crea sesiones para este horario. */
    vigenteHasta: { type: Date, required: true },
    /**
     * Si es true, al pasar el último día de sesiones de la categoría
     * (máx. vigenteHasta entre sus horarios) se deja de facturar a los inscriptos.
     */
    terminarCuotasAlFinalizar: { type: Boolean, default: false },
    /**
     * Meses con cobertura parcial (inicio/fin a mitad de mes) donde se aplica
     * un % extra de descuento al generar la cuota (ej. mitad de cuota = 50).
     */
    descuentosMesesParciales: [
        {
            mes: { type: Number, min: 1, max: 12, required: true },
            anio: { type: Number, required: true },
            porcentaje: { type: Number, min: 0, max: 100, default: 50 },
        },
    ],
}, { timestamps: true });

// Índice para evitar que una categoría tenga el mismo horario duplicado
scheduleSchema.index({ categoria: 1, diaSemana: 1, horaInicio: 1 }, { unique: true });

export const getScheduleModel = (tenantDB) => {
    return tenantDB.models.Schedule || tenantDB.model('Schedule', scheduleSchema);
};