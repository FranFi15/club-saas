import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: ['entrenamiento', 'alquiler', 'partido', 'consulta_nutricion', 'consulta_psicologia'],
        default: 'entrenamiento',
    },
    /** Nombre visible (ej. "Entreno técnico", "Amistoso vs X"). Si está vacío, se usa el tipo. */
    nombreSesion: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
    },
    /** Si es true, la asistencia no se exige como sesión obligatoria del plantel. */
    esOpcional: {
        type: Boolean,
        default: false,
    },
    categoria: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category',
        required: function requiredCategoria() {
            return this.tipo !== 'alquiler';
        },
    },
    fecha: { type: Date, required: true }, // Ej: 2024-04-14
    horaInicio: { type: String, required: true },
    horaFin: { type: String, required: true },
    
    // El espacio interno es opcional ahora, por si entrenan afuera
    espacio: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Space'
    },

    /** Plantilla de grilla que originó la sesión (entrenamientos automáticos). */
    grillaHorario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule',
    },
    lugarExterno: { 
        type: String, 
        trim: true 
    },

    /** Consulta individual (nutrición / psicología): lugar libre (consultorio externo, videollamada, etc.) */
    lugarLibre: {
        type: String,
        trim: true,
        default: '',
    },

    /** Notas de evolución tras consultas de psicología (visible en detalle de sesión para staff autorizado). */
    informeSesion: {
        type: String,
        trim: true,
        default: '',
    },

    /** Si el informe puede verse desde cuentas de atleta / tutor (consultas `consulta_psicologia`). */
    informeVisibleParaAtleta: {
        type: Boolean,
        default: true,
    },
    informeVisibleParaTutor: {
        type: Boolean,
        default: true,
    },

    /** Atleta único asociado a la consulta (no es sesión de equipo completo) */
    atletaIndividual: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    /** Staff que creó la sesión (entrenamientos / partidos / consultas). */
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    /** Confirmación de asistencia del atleta (consultas nutrición / psicología) */
    confirmacionAtleta: {
        estado: {
            type: String,
            enum: ['pendiente', 'confirmada', 'rechazada'],
            default: 'pendiente',
        },
        respondidaEn: { type: Date },
        respondidaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        motivoRechazo: { type: String, trim: true, default: '' },
    },
    
    // Cambié 'realizada' por 'completada' para que coincida con nuestro controlador
    estado: { 
        type: String, 
        enum: ['programada', 'completada', 'cancelada'], 
        default: 'programada' 
    },
    
    asistencia: [{
        atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        estado: { type: String, enum: ['presente', 'ausente', 'tarde'] },
        observaciones: { type: String } 
    }],
    
    motivoCancelacion: { type: String },

    /** El espacio quedó indisponible y el staff debe elegir nuevo lugar. */
    reubicacionPendiente: { type: Boolean, default: false },
    reubicacionMotivo: { type: String, trim: true, default: '' },
    espacioSuspendido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Space',
    },

    // --- LA NUEVA MAGIA DE ALTO RENDIMIENTO ---
    
    // 1. Lo que planificó el DT
    planEntrenamiento: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan' },
    
    // 2. Lo que realmente se hizo en la cancha (El ticket del cronómetro)
    bloquesEjecutados: [{
        tituloBloque: { type: String },
        formato: { type: String },
        enfoque: { type: String },
        duracionPlanificada: { type: Number },
        duracionRealMinutos: { type: Number } 
    }],
    
    // 3. (Opcional a futuro) RPE x Minutos Reales
    cargaTotalSesion: { type: Number },

    /** Lista de buena fe del partido: jugadores convocados y staff que viaja. */
    listaBuenaFe: [{
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        tipoPersona: { type: String, enum: ['jugador', 'staff'], default: 'jugador' },
        dorsal: { type: String, trim: true, default: '' },
    }],

    /** Copia de la planilla elegida. Editar la biblioteca no cambia este partido. */
    planilla: {
        sheetId: { type: mongoose.Schema.Types.ObjectId },
        nombre: { type: String, default: '' },
        cancha: {
            deporte: { type: String, default: '' },
            imagenUrl: { type: String, default: '' },
        },
        reloj: {
            activo: { type: Boolean, default: false },
            periodos: { type: Number, default: 4 },
            minutosPorPeriodo: { type: Number, default: 10 },
            jugadoresEnCancha: { type: Number, default: 5 },
        },
        campos: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },

    /** Valores que no salen de la cancha (resultado, rival, notas). */
    planillaValores: {
        partido: { type: mongoose.Schema.Types.Mixed, default: {} },
        personas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },

    jugadas: [{
        x: { type: Number, min: 0, max: 1 },
        y: { type: Number, min: 0, max: 1 },
        campoId: { type: String },
        resultado: { type: String, enum: ['anoto', 'erro'] },
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        periodo: { type: Number, default: 1 },
        relojMs: { type: Number, default: 0 },
    }],

    posesiones: [{
        equipo: { type: String, enum: ['nosotros', 'rival'] },
        periodo: { type: Number, default: 1 },
        relojMs: { type: Number, default: 0 },
    }],

    relojEventos: [{
        tipo: { type: String, enum: ['inicio', 'pausa', 'fin_periodo', 'quinteto', 'cambio'] },
        periodo: { type: Number, default: 1 },
        relojMs: { type: Number, default: 0 },
        marcaEn: { type: Date },
        enCancha: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        sale: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        entra: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    informeEnviadoEn: { type: Date },

}, { timestamps: true });

sessionSchema.index({ categoria: 1, fecha: 1 });
sessionSchema.index({ espacio: 1, fecha: 1 });
sessionSchema.index({ atletaIndividual: 1, fecha: 1 });

export const getSessionModel = (tenantDB) => {
    return tenantDB.models.Session || tenantDB.model('Session', sessionSchema);
};