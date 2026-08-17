import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    dni: { type: String, trim: true }, 
    fechaNacimiento: { type: Date },
    /** M / F — antropometría ISAK (Durnin & Womersley). */
    sexo: { type: String, enum: ['M', 'F', ''], default: '' },
    email: { 
        type: String, 
        required: true, 
        lowercase: true, 
        trim: true 
    },
    password: { type: String, required: true },
    fotoPerfil: { type: String, default: '' },
    
    // --- DATOS DE PERFIL Y CONTACTO (Para el Autoservicio) ---
    telefono: { type: String, trim: true },
    direccion: { type: String, trim: true },
    contactoEmergencia: { type: String, trim: true },
    obraSocial: { type: String, trim: true },
    
    // Vínculo familiar (Para el efecto dominó al borrar)
    tutorPrincipal: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /** Solo tutores: % de descuento de esta familia (override del global del club). */
    descuentoFamiliar: { type: Number, default: null, min: 0, max: 100 },

    rol: { 
        type: String, 
        enum: [
            'admin_club', 
            'administrativo',
            'control_ingreso', 
            'profe', 
            'preparador_fisico', 
            'nutricionista',
            'psicologo',
            'medico', // deprecated v2 — datos legacy
            'kinesiologo', // deprecated v2 — datos legacy
            'atleta', 
            'tutor'
        ],
        required: true 
    },
    
    // Estado Administrativo/Financiero
    estado: { 
        type: String, 
        enum: ['activo', 'inactivo', 'moroso'], 
        default: 'activo' 
    },

    /** Atletas: si es false, no ven la pestaña Cuotas ni pueden pagar en la app. */
    cuotasEnApp: { type: Boolean, default: true },

    /** Para badges de novedades / recursos en la app del miembro. */
    lastSeenNewsAt: { type: Date, default: null },
    lastSeenResourcesAt: { type: Date, default: null },

    /** Ítems del feed de notificaciones ocultados por el usuario (news:/resource:/doc:). */
    dismissedNotificationIds: { type: [String], default: [] },

    /** Tokens Expo Push — un registro por dispositivo. */
    expoPushTokens: [
        {
            token: { type: String, required: true },
            platform: { type: String, enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' },
            updatedAt: { type: Date, default: Date.now },
        },
    ],

    /** Aceptación de Términos y condiciones (versión publicada en la app). */
    acceptedTermsVersion: { type: String, default: '', trim: true },
    acceptedTermsAt: { type: Date, default: null },

    // --- ESTADO DEPORTIVO / MÉDICO (Semáforo para el DT) ---
    disponibilidad: {
        type: String,
        enum: ['disponible', 'lesionado', 'diferenciado'],
        default: 'disponible'
    }

}, { timestamps: true });

// Índice de unicidad manual para email dentro de la misma base de datos del club
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ tutorPrincipal: 1, rol: 1 });
userSchema.index({ rol: 1, estado: 1 });

// Encriptamos la contraseña antes de guardar
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseñas durante el login
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};


export const getUserModel = (tenantDB) => {
    return tenantDB.models.User || tenantDB.model('User', userSchema);
};