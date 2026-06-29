import mongoose from 'mongoose';

const injurySchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medico: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Quien diagnostica
    kinesiologo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Quien sigue la rehabilitación
    
    diagnostico: { type: String, required: true },
    tipoLesión: { type: String, enum: ['ósea', 'muscular', 'ligamentaria', 'tendinosa', 'otra'] },
    fechaLesion: { type: Date, default: Date.now },
    
    // El estado actual en el que se encuentra el pibe
    estadoRecuperacion: { 
        type: String, 
        enum: ['reposo_total', 'kinesiologia', 'gimnasio_diferenciado', 'campo_diferenciado', 'alta_medica'], 
        default: 'reposo_total' 
    },
    
    // Etapas personalizadas (Tu idea de las etapas)
    etapaActual: { type: Number, default: 1 },
    totalEtapas: { type: Number, default: 4 },
    
    // Control de Disponibilidad para DT/PF
    estaDisponibleParaEntrenar: { type: Boolean, default: false },
    
    observaciones: { type: String },
    historialEtapas: [{
        etapa: Number,
        descripcion: String,
        fecha: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Modelo para turnos de kinesiología
const medicalAppointmentSchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profesional: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fechaHora: { type: Date, required: true },
    motivo: { type: String },
    estado: { type: String, enum: ['programado', 'realizado', 'cancelado'], default: 'programado' }
}, { timestamps: true });

export const getInjuryModel = (tenantDB) => tenantDB.models.Injury || tenantDB.model('Injury', injurySchema);
export const getMedicalAppointmentModel = (tenantDB) => tenantDB.models.MedicalAppointment || tenantDB.model('MedicalAppointment', medicalAppointmentSchema);