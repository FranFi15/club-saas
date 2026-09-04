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
    /** Reserva online por socios/atletas/tutores (Mercado Pago). */
    alquilerOnline: {
        habilitado: { type: Boolean, default: false },
        precioPorHora: { type: Number, default: 0, min: 0 },
        /** Ventana horaria diaria en la que se ofrecen slots (HH:mm). */
        horaInicio: { type: String, default: '08:00', trim: true },
        horaFin: { type: String, default: '22:00', trim: true },
        duracionSlotMinutos: {
            type: Number,
            enum: [30, 60, 90],
            default: 60,
        },
        /** Días de la semana en que se puede alquilar online. */
        diasDisponibles: {
            type: [
                {
                    type: String,
                    enum: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
                },
            ],
            default: () => ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
        },
    },
}, { timestamps: true });

export const getSpaceModel = (tenantDB) => {
    return tenantDB.models.Space || tenantDB.model('Space', spaceSchema);
};