import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { SPONSOR_MEMBER_ROLES } from '../models/sponsor.model.js';
import { SPONSOR_PAYMENT_METODOS } from '../models/sponsorPayment.model.js';
import { markOverduePayments } from '../services/overduePayments.service.js';

function parseMoney(value, label = 'Monto mensual') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        const err = new Error(`${label} inválido.`);
        err.statusCode = 400;
        throw err;
    }
    return Math.round(n * 100) / 100;
}

function parsePeriod(mes, anio) {
    const m = Number(mes);
    const a = Number(anio);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
        const err = new Error('Mes inválido (1-12).');
        err.statusCode = 400;
        throw err;
    }
    if (!Number.isInteger(a) || a < 2000 || a > 2100) {
        const err = new Error('Año inválido.');
        err.statusCode = 400;
        throw err;
    }
    return { mes: m, anio: a };
}

function sanitizeRoles(rolesIn) {
    if (!Array.isArray(rolesIn)) return [];
    return [...new Set(rolesIn.map(String).filter((r) => SPONSOR_MEMBER_ROLES.includes(r)))];
}

function sanitizeFeeIds(idsIn) {
    if (!Array.isArray(idsIn)) return [];
    return [
        ...new Set(
            idsIn
                .map((id) => String(id || '').trim())
                .filter((id) => mongoose.Types.ObjectId.isValid(id)),
        ),
    ];
}

function applySponsorBody(doc, body) {
    if (body.nombre !== undefined) {
        const nombre = String(body.nombre || '').trim();
        if (!nombre) {
            const err = new Error('El nombre del sponsor es obligatorio.');
            err.statusCode = 400;
            throw err;
        }
        doc.nombre = nombre;
    }
    if (body.registro !== undefined) doc.registro = String(body.registro || '').trim();
    if (body.fotoUrl !== undefined) doc.fotoUrl = String(body.fotoUrl || '').trim();
    if (body.montoMensual !== undefined) doc.montoMensual = parseMoney(body.montoMensual);
    if (body.beneficios !== undefined) doc.beneficios = String(body.beneficios || '').trim();
    if (body.rolesAplicables !== undefined) doc.rolesAplicables = sanitizeRoles(body.rolesAplicables);
    if (body.cuotasSociales !== undefined) doc.cuotasSociales = sanitizeFeeIds(body.cuotasSociales);
    if (body.activo !== undefined) {
        doc.activo = body.activo === true || body.activo === 'true';
    }
}

function sponsorMatchesMember(sponsor, user) {
    const roles = Array.isArray(sponsor.rolesAplicables) ? sponsor.rolesAplicables : [];
    const fees = Array.isArray(sponsor.cuotasSociales) ? sponsor.cuotasSociales : [];
    if (!roles.length && !fees.length) return false;

    if (roles.includes(user.rol)) return true;

    const assigned = user.cuotaSocialAsignada ? String(user.cuotaSocialAsignada) : '';
    if (assigned && fees.some((id) => String(id) === assigned)) return true;

    return false;
}

async function memberIsMoroso(models, user) {
    if (user.estado === 'moroso') return true;
    try {
        await markOverduePayments(models);
    } catch {
        /* best-effort */
    }
    const count = await models.Payment.countDocuments({
        atleta: user._id,
        estado: 'vencido',
    });
    return count > 0;
}

function publicSponsor(s) {
    return {
        _id: s._id,
        nombre: s.nombre,
        registro: s.registro || '',
        fotoUrl: s.fotoUrl || '',
        beneficios: s.beneficios || '',
    };
}

function serializePago(p) {
    if (!p) return null;
    return {
        _id: p._id,
        mes: p.mes,
        anio: p.anio,
        monto: p.monto,
        estado: p.estado,
        comprobanteUrl: p.comprobanteUrl || '',
        fechaPago: p.fechaPago || null,
        metodoPago: p.metodoPago || null,
        notas: p.notas || '',
    };
}

/** Crea filas pendientes del mes para sponsors activos que aún no tienen pago. */
async function ensureSponsorPaymentsForMonth(models, mes, anio) {
    const { Sponsor, SponsorPayment } = models;
    const sponsors = await Sponsor.find({ activo: true }).select('_id montoMensual').lean();
    if (!sponsors.length) return;

    const existing = await SponsorPayment.find({ mes, anio }).select('sponsor').lean();
    const have = new Set(existing.map((e) => String(e.sponsor)));

    const toInsert = sponsors
        .filter((s) => !have.has(String(s._id)))
        .map((s) => ({
            sponsor: s._id,
            mes,
            anio,
            monto: Number(s.montoMensual) || 0,
            estado: 'pendiente',
        }));

    if (toInsert.length) {
        try {
            await SponsorPayment.insertMany(toInsert, { ordered: false });
        } catch (e) {
            // Duplicate key races are fine.
            if (e?.code !== 11000 && !String(e?.message || '').includes('duplicate')) {
                throw e;
            }
        }
    }
}

// @desc    Listar sponsors (admin) — con pago del mes si mes/anio
// @route   GET /api/financial/sponsors?mes=&anio=&includeInactive=
const listSponsors = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
    const filter = includeInactive ? {} : { activo: true };

    let period = null;
    if (req.query.mes != null && req.query.anio != null) {
        period = parsePeriod(req.query.mes, req.query.anio);
        await ensureSponsorPaymentsForMonth(req.models, period.mes, period.anio);
    }

    const sponsors = await Sponsor.find(filter)
        .populate('cuotasSociales', 'nombre monto activo')
        .sort({ nombre: 1 })
        .lean();

    let pagoBySponsor = new Map();
    if (period) {
        const pagos = await SponsorPayment.find({ mes: period.mes, anio: period.anio }).lean();
        pagoBySponsor = new Map(pagos.map((p) => [String(p.sponsor), p]));
    }

    res.json({
        mes: period?.mes ?? null,
        anio: period?.anio ?? null,
        sponsors: sponsors.map((s) => ({
            ...s,
            pagoMes: period ? serializePago(pagoBySponsor.get(String(s._id))) : null,
        })),
    });
});

// @desc    Crear sponsor
// @route   POST /api/financial/sponsors
const createSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
        res.status(400);
        throw new Error('El nombre del sponsor es obligatorio.');
    }

    const doc = new Sponsor({
        nombre,
        registro: '',
        fotoUrl: '',
        montoMensual: 0,
        beneficios: '',
        rolesAplicables: [],
        cuotasSociales: [],
        activo: true,
    });
    applySponsorBody(doc, req.body);
    if (!doc.rolesAplicables.length && !doc.cuotasSociales.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario o una cuota social.');
    }
    await doc.save();

    // Alta inmediata del pago pendiente del mes actual (o el indicado).
    const now = new Date();
    let mes = now.getMonth() + 1;
    let anio = now.getFullYear();
    if (req.body?.mes != null && req.body?.anio != null) {
        ({ mes, anio } = parsePeriod(req.body.mes, req.body.anio));
    }
    let pagoMes = null;
    try {
        pagoMes = await SponsorPayment.create({
            sponsor: doc._id,
            mes,
            anio,
            monto: doc.montoMensual || 0,
            estado: 'pendiente',
        });
    } catch {
        pagoMes = await SponsorPayment.findOne({ sponsor: doc._id, mes, anio });
    }

    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.status(201).json({
        sponsor: { ...doc.toObject(), pagoMes: serializePago(pagoMes) },
        message: 'Sponsor creado.',
    });
});

// @desc    Actualizar sponsor
// @route   PATCH /api/financial/sponsors/:id
const updateSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const doc = await Sponsor.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const prevMonto = doc.montoMensual;
    applySponsorBody(doc, req.body);
    if (!doc.rolesAplicables.length && !doc.cuotasSociales.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario o una cuota social.');
    }
    await doc.save();

    // Si cambió el monto, actualizá pagos pendientes del mes en curso.
    if (doc.montoMensual !== prevMonto) {
        const now = new Date();
        await SponsorPayment.updateMany(
            {
                sponsor: doc._id,
                estado: 'pendiente',
                mes: now.getMonth() + 1,
                anio: now.getFullYear(),
            },
            { $set: { monto: doc.montoMensual } },
        );
    }

    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.json({ sponsor: doc, message: 'Sponsor actualizado.' });
});

// @desc    Eliminar sponsor
// @route   DELETE /api/financial/sponsors/:id
const deleteSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const doc = await Sponsor.findByIdAndDelete(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    await SponsorPayment.deleteMany({ sponsor: doc._id });
    res.json({ message: 'Sponsor eliminado.' });
});

// @desc    Confirmar pago del mes (con comprobante opcional)
// @route   PATCH /api/financial/sponsors/:id/pay-month
const paySponsorMonth = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }

    const { mes, anio } = parsePeriod(req.body?.mes, req.body?.anio);
    await ensureSponsorPaymentsForMonth(req.models, mes, anio);

    let pago = await SponsorPayment.findOne({ sponsor: sponsor._id, mes, anio });
    if (!pago) {
        pago = await SponsorPayment.create({
            sponsor: sponsor._id,
            mes,
            anio,
            monto: sponsor.montoMensual || 0,
            estado: 'pendiente',
        });
    }

    if (req.body?.monto != null && req.body.monto !== '') {
        pago.monto = parseMoney(req.body.monto, 'Monto');
    }

    const metodo = String(req.body?.metodoPago || 'transferencia');
    if (!SPONSOR_PAYMENT_METODOS.includes(metodo)) {
        res.status(400);
        throw new Error('Método de pago inválido.');
    }

    pago.estado = 'pagado';
    pago.metodoPago = metodo;
    pago.fechaPago = req.body?.fechaPago ? new Date(req.body.fechaPago) : new Date();
    if (Number.isNaN(pago.fechaPago.getTime())) {
        res.status(400);
        throw new Error('Fecha de pago inválida.');
    }
    if (req.body?.comprobanteUrl !== undefined) {
        pago.comprobanteUrl = String(req.body.comprobanteUrl || '').trim();
    }
    if (req.body?.notas !== undefined) {
        pago.notas = String(req.body.notas || '').trim();
    }
    pago.registradoPor = req.user._id;
    await pago.save();

    res.json({
        message: 'Pago del sponsor confirmado.',
        pago: serializePago(pago),
    });
});

// @desc    Marcar aporte del mes como pendiente (revertir)
// @route   PATCH /api/financial/sponsors/:id/unpay-month
const unpaySponsorMonth = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const sponsor = await Sponsor.findById(req.params.id).select('_id');
    if (!sponsor) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const { mes, anio } = parsePeriod(req.body?.mes, req.body?.anio);
    const pago = await SponsorPayment.findOne({ sponsor: sponsor._id, mes, anio });
    if (!pago) {
        res.status(404);
        throw new Error('No hay registro de pago para ese mes.');
    }
    pago.estado = 'pendiente';
    pago.fechaPago = undefined;
    pago.metodoPago = undefined;
    if (req.body?.clearComprobante) pago.comprobanteUrl = '';
    await pago.save();
    res.json({ message: 'Pago revertido a pendiente.', pago: serializePago(pago) });
});

// @desc    Beneficios visibles para el miembro (si no es moroso)
// @route   GET /api/financial/sponsors/my-benefits
const getMySponsorBenefits = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
    const user = req.user;

    if (!SPONSOR_MEMBER_ROLES.includes(user.rol)) {
        res.status(403);
        throw new Error('Solo atletas, socios o tutores pueden ver beneficios.');
    }

    const moroso = await memberIsMoroso(req.models, user);
    if (moroso) {
        return res.json({
            eligible: false,
            moroso: true,
            message: 'Los beneficios de sponsors están disponibles cuando estás al día con tus cuotas.',
            sponsors: [],
        });
    }

    const all = await Sponsor.find({ activo: true })
        .select('nombre registro fotoUrl beneficios rolesAplicables cuotasSociales')
        .lean();

    const matched = all.filter((s) => sponsorMatchesMember(s, user)).map(publicSponsor);

    res.json({
        eligible: true,
        moroso: false,
        sponsors: matched,
    });
});

export {
    listSponsors,
    createSponsor,
    updateSponsor,
    deleteSponsor,
    paySponsorMonth,
    unpaySponsorMonth,
    getMySponsorBenefits,
};
