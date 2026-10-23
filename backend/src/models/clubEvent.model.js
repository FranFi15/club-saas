import mongoose from 'mongoose';

const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

const tipoEntradaSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        /** Precio de lista / visitante. */
        precio: { type: Number, required: true, min: 0, default: 0 },
        cupo: { type: Number, required: true, min: 0 },
        vendidas: { type: Number, default: 0, min: 0 },
        activo: { type: Boolean, default: true },
    },
    { _id: true },
);

const reglaDescuentoSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        /** Vacío = cualquier rol de miembro logueado. */
        roles: [{ type: String, enum: MEMBER_ROLES }],
        cuotasSociales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialFee' }],
        planes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],
        modo: {
            type: String,
            enum: ['porcentaje', 'precio_fijo', 'gratis'],
            required: true,
            default: 'porcentaje',
        },
        valor: { type: Number, default: 0, min: 0 },
        maxEntradasConDescuento: { type: Number, default: 1, min: 1 },
        activo: { type: Boolean, default: true },
    },
    { _id: true },
);

const clubEventSchema = new mongoose.Schema(
    {
        titulo: { type: String, required: true, trim: true },
        descripcion: { type: String, trim: true, default: '' },
        imagenUrl: { type: String, trim: true, default: '' },
        /** Plano reutilizable. El evento guarda una copia de las secciones. */
        estadioId: { type: mongoose.Schema.Types.ObjectId, default: null },
        mapaEstadioUrl: { type: String, trim: true, default: '' },
        lugar: { type: String, trim: true, default: '' },
        fechaInicio: { type: Date, required: true },
        fechaFin: { type: Date },
        estado: {
            type: String,
            enum: ['borrador', 'publicado', 'cancelado', 'finalizado'],
            default: 'borrador',
        },
        slug: { type: String, required: true, trim: true, lowercase: true },
        tiposEntrada: [tipoEntradaSchema],
        secciones: [
            {
                nombre: { type: String, required: true, trim: true },
                filas: { type: Number, required: true, min: 1, max: 40 },
                asientosPorFila: { type: Number, required: true, min: 1, max: 80 },
                tipoEntrada: { type: mongoose.Schema.Types.ObjectId, required: true },
                /** Rectángulo del sector en el plano, en porcentaje. */
                x: { type: Number, default: 50, min: 0, max: 100 },
                y: { type: Number, default: 50, min: 0, max: 100 },
                w: { type: Number, default: 0, min: 0, max: 100 },
                h: { type: Number, default: 0, min: 0, max: 100 },
            },
        ],
        reglasDescuento: [reglaDescuentoSchema],
        /** Usuarios que ven el escáner de este evento. El ingreso de socios no usa esta lista. */
        controlIngreso: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

clubEventSchema.index({ slug: 1 }, { unique: true });
clubEventSchema.index({ estado: 1, fechaInicio: 1 });

export const getClubEventModel = (tenantDB) =>
    tenantDB.models.ClubEvent || tenantDB.model('ClubEvent', clubEventSchema);

const compradorSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        apellido: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        dni: { type: String, trim: true, default: '' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { _id: false },
);

const eventTicketOrderSchema = new mongoose.Schema(
    {
        evento: { type: mongoose.Schema.Types.ObjectId, ref: 'ClubEvent', required: true },
        tipoEntrada: { type: mongoose.Schema.Types.ObjectId, required: true },
        cantidad: { type: Number, required: true, min: 1 },
        comprador: { type: compradorSchema, required: true },
        precioLista: { type: Number, required: true, min: 0 },
        precioConDescuento: { type: Number, required: true, min: 0 },
        cantidadConDescuento: { type: Number, required: true, min: 0 },
        cantidadPrecioLleno: { type: Number, required: true, min: 0 },
        reglaAplicada: {
            id: { type: mongoose.Schema.Types.ObjectId, default: null },
            nombre: { type: String, default: null },
        },
        descuentoBloqueadoPorDeuda: { type: Boolean, default: false },
        montoTotal: { type: Number, required: true, min: 0 },
        /** Una persona por entrada. El comprador puede ser distinto. */
        asistentes: [
            {
                nombre: { type: String, required: true, trim: true },
                apellido: { type: String, required: true, trim: true },
                dni: { type: String, required: true, trim: true },
                asiento: {
                    seccionId: { type: mongoose.Schema.Types.ObjectId },
                    seccionNombre: { type: String, trim: true, default: '' },
                    fila: { type: Number, min: 1 },
                    numero: { type: Number, min: 1 },
                },
            },
        ],
        estado: {
            type: String,
            enum: ['pendiente_pago', 'pagada', 'gratis', 'cancelada', 'expirada'],
            default: 'pendiente_pago',
        },
        /** Vacío en compras online anteriores. Efectivo = carga manual del club. */
        medioPago: {
            type: String,
            enum: ['', 'efectivo', 'mercadopago'],
            default: '',
        },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        holdUntil: { type: Date },
        mpPreferenceId: { type: String, default: '' },
        mpPaymentId: { type: String, default: '' },
    },
    { timestamps: true },
);

eventTicketOrderSchema.index({ evento: 1, createdAt: -1 });
eventTicketOrderSchema.index({ 'comprador.user': 1, createdAt: -1 });
eventTicketOrderSchema.index({ estado: 1, holdUntil: 1 });

export const getEventTicketOrderModel = (tenantDB) =>
    tenantDB.models.EventTicketOrder ||
    tenantDB.model('EventTicketOrder', eventTicketOrderSchema);

const eventTicketSchema = new mongoose.Schema(
    {
        evento: { type: mongoose.Schema.Types.ObjectId, ref: 'ClubEvent', required: true },
        orden: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTicketOrder', required: true },
        tipoEntrada: { type: mongoose.Schema.Types.ObjectId, required: true },
        tipoEntradaNombre: { type: String, trim: true, default: '' },
        codigo: { type: String, required: true, trim: true },
        tokenNonce: { type: String, required: true },
        estado: {
            type: String,
            enum: ['valida', 'usada', 'anulada'],
            default: 'valida',
        },
        precioCobrado: { type: Number, default: 0, min: 0 },
        usadoEn: { type: Date },
        escaneadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        compradorSnapshot: {
            nombre: String,
            apellido: String,
            email: String,
            dni: String,
        },
        /** Persona que entra con esta entrada. */
        titular: {
            nombre: { type: String, trim: true, default: '' },
            apellido: { type: String, trim: true, default: '' },
            dni: { type: String, trim: true, default: '' },
        },
        asiento: {
            seccionId: { type: mongoose.Schema.Types.ObjectId },
            seccionNombre: { type: String, trim: true, default: '' },
            fila: { type: Number, min: 1 },
            numero: { type: Number, min: 1 },
        },
    },
    { timestamps: true },
);

eventTicketSchema.index({ codigo: 1 }, { unique: true });
eventTicketSchema.index({ evento: 1, estado: 1 });
eventTicketSchema.index({ orden: 1 });

export const getEventTicketModel = (tenantDB) =>
    tenantDB.models.EventTicket || tenantDB.model('EventTicket', eventTicketSchema);

const eventDoorLogSchema = new mongoose.Schema(
    {
        evento: { type: mongoose.Schema.Types.ObjectId, ref: 'ClubEvent', required: true, index: true },
        ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTicket', required: true, index: true },
        decision: { type: String, enum: ['entro', 'no_entro'], required: true },
        scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scannedAt: { type: Date, default: Date.now, index: true },
        codigo: { type: String, trim: true, default: '' },
        tipoEntradaNombre: { type: String, trim: true, default: '' },
        titular: {
            nombre: { type: String, trim: true, default: '' },
            apellido: { type: String, trim: true, default: '' },
            dni: { type: String, trim: true, default: '' },
        },
    },
    { timestamps: true },
);

eventDoorLogSchema.index({ evento: 1, scannedAt: -1 });

export const getEventDoorLogModel = (tenantDB) =>
    tenantDB.models.EventDoorLog || tenantDB.model('EventDoorLog', eventDoorLogSchema);

export { MEMBER_ROLES as EVENT_MEMBER_ROLES };
