import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ClubSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    urlIdentifier: { type: String, required: true, unique: true, trim: true, lowercase: true }, // Ej: "club-olimpico"
    emailContacto: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true, 
        lowercase: true, 
        match: [/.+@.+\..+/, 'Por favor, usa un email válido'] 
    },
    clubId: { type: String, unique: true, default: uuidv4 },
    // Llave secreta para que el servidor de los clubes se comunique con este Super-Admin
    apiSecretKey: { type: String, required: true, unique: true, default: () => uuidv4().replace(/-/g, '') + Date.now().toString(36) },
    estadoSuscripcion: { type: String, enum: ['activo', 'inactivo', 'periodo_prueba', 'vencido', 'cancelado'], default: 'periodo_prueba' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#150224' },
    // El string de conexión único para la BD de este club en particular
    connectionStringDB: { type: String, required: true, unique: true },
    userCount: { type: Number, required: true, default: 0 }, // Atletas (rol atleta) — base para facturación
    /** ID de usuario/vendedor Mercado Pago (OAuth) para rutear webhooks multi-tenant. */
    mercadopagoUserId: { type: String, default: '', trim: true },
}, { timestamps: true });

ClubSchema.index(
    { mercadopagoUserId: 1 },
    {
        unique: true,
        partialFilterExpression: { mercadopagoUserId: { $exists: true, $type: 'string', $gt: '' } },
    },
);

const Club = mongoose.model('Club', ClubSchema);

export default Club;