import mongoose from 'mongoose';

const rentalSchema = new mongoose.Schema({
    // 1. Datos del cliente (no hace falta que sea un User registrado)
    nombreCliente: { type: String, required: true, trim: true },
    telefonoCliente: { type: String, required: true, trim: true },
    emailCliente: { type: String, trim: true },

    // 2. Datos de la cancha y horario
    espacio: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    fecha: { type: Date, required: true },
    horaInicio: { type: String, required: true },
    horaFin: { type: String, required: true },

    // 3. El ancla con nuestro Calendario (Para el Patovica)
    sesionVinculada: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },

    // 4. Dinero
    montoTotal: { type: Number, required: true },
    señaPagada: { type: Number, default: 0 },
    estadoPago: { 
        type: String, 
        enum: ['pendiente', 'señado', 'pagado'], 
        default: 'pendiente' 
    },

    estadoReserva: { 
        type: String, 
        enum: ['confirmada', 'cancelada', 'completada'], 
        default: 'confirmada' 
    },
    notas: { type: String }
}, { timestamps: true });

export const getRentalModel = (tenantDB) => {
    return tenantDB.models.Rental || tenantDB.model('Rental', rentalSchema);
};