import asyncHandler from 'express-async-handler';

const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

function normalizeDiscount(body) {
    const nombre = String(body?.nombre || '').trim();
    if (!nombre) {
        const err = new Error('El descuento necesita un nombre.');
        err.statusCode = 400;
        throw err;
    }
    return {
        nombre,
        roles: Array.isArray(body?.roles) ? body.roles.filter((rol) => MEMBER_ROLES.includes(rol)) : [],
        cuotasSociales: Array.isArray(body?.cuotasSociales) ? body.cuotasSociales : [],
        planes: Array.isArray(body?.planes) ? body.planes : [],
        modo: ['porcentaje', 'precio_fijo', 'gratis'].includes(body?.modo) ? body.modo : 'porcentaje',
        valor: Math.max(0, Number(body?.valor) || 0),
        maxEntradasConDescuento: Math.max(1, Math.floor(Number(body?.maxEntradasConDescuento) || 1)),
        activo: body?.activo !== false,
    };
}

export const listDiscounts = asyncHandler(async (req, res) => {
    const discounts = await req.models.Discount.find({ activo: { $ne: false } }).sort({ nombre: 1 }).lean();
    res.json(discounts);
});

export const createDiscount = asyncHandler(async (req, res) => {
    const discount = await req.models.Discount.create(normalizeDiscount(req.body));
    res.status(201).json(discount);
});

export const deleteDiscount = asyncHandler(async (req, res) => {
    const discount = await req.models.Discount.findByIdAndDelete(req.params.id);
    if (!discount) {
        res.status(404);
        throw new Error('Descuento no encontrado.');
    }
    res.json({ ok: true });
});
