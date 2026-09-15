import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { SPONSOR_MEMBER_ROLES } from '../models/sponsor.model.js';
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

// @desc    Listar sponsors (admin)
// @route   GET /api/financial/sponsors
const listSponsors = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
    const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
    const filter = includeInactive ? {} : { activo: true };
    const sponsors = await Sponsor.find(filter)
        .populate('cuotasSociales', 'nombre monto activo')
        .sort({ nombre: 1 })
        .lean();
    res.json({ sponsors });
});

// @desc    Crear sponsor
// @route   POST /api/financial/sponsors
const createSponsor = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
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
    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.status(201).json({ sponsor: doc, message: 'Sponsor creado.' });
});

// @desc    Actualizar sponsor
// @route   PATCH /api/financial/sponsors/:id
const updateSponsor = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
    const doc = await Sponsor.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    applySponsorBody(doc, req.body);
    if (!doc.rolesAplicables.length && !doc.cuotasSociales.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario o una cuota social.');
    }
    await doc.save();
    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.json({ sponsor: doc, message: 'Sponsor actualizado.' });
});

// @desc    Eliminar sponsor
// @route   DELETE /api/financial/sponsors/:id
const deleteSponsor = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
    const doc = await Sponsor.findByIdAndDelete(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    res.json({ message: 'Sponsor eliminado.' });
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
    getMySponsorBenefits,
};
