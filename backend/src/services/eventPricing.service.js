import { EVENT_MEMBER_ROLES } from '../models/clubEvent.model.js';

function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function idsEqual(a, b) {
    return String(a) === String(b);
}

function idInList(id, list) {
    if (!id || !Array.isArray(list) || !list.length) return false;
    const s = String(id);
    return list.some((x) => String(x?._id ?? x) === s);
}

/**
 * @returns {Promise<{ rol: string|null, cuotaSocialId: string|null, planIds: string[], tieneVencidos: boolean }>}
 */
export async function resolveBuyerContext(models, user) {
    if (!user) {
        return { rol: null, cuotaSocialId: null, planIds: [], tieneVencidos: false };
    }

    const userId = user._id || user.id;
    const rol = user.rol || null;
    const cuotaSocialId = user.cuotaSocialAsignada
        ? String(user.cuotaSocialAsignada._id || user.cuotaSocialAsignada)
        : null;

    const { Enrollment, Payment } = models;
    const [enrollments, vencidosCount] = await Promise.all([
        Enrollment.find({ atleta: userId, estado: 'activo' }).select('plan').lean(),
        Payment.countDocuments({ atleta: userId, estado: 'vencido' }),
    ]);

    const planIds = [
        ...new Set(
            enrollments
                .map((e) => (e.plan ? String(e.plan) : null))
                .filter(Boolean),
        ),
    ];

    return {
        rol,
        cuotaSocialId,
        planIds,
        tieneVencidos: vencidosCount > 0,
    };
}

/**
 * First matching active rule, or null (full price).
 */
export function matchRule(event, context) {
    if (!context?.rol || !EVENT_MEMBER_ROLES.includes(context.rol)) return null;
    if (context.tieneVencidos) return null;

    const rules = Array.isArray(event?.reglasDescuento) ? event.reglasDescuento : [];
    for (const rule of rules) {
        if (!rule?.activo) continue;

        const roles = Array.isArray(rule.roles) ? rule.roles : [];
        if (roles.length && !roles.includes(context.rol)) continue;

        const cuotas = Array.isArray(rule.cuotasSociales) ? rule.cuotasSociales : [];
        if (cuotas.length && !idInList(context.cuotaSocialId, cuotas)) continue;

        const planes = Array.isArray(rule.planes) ? rule.planes : [];
        if (planes.length) {
            const ok = (context.planIds || []).some((pid) => idInList(pid, planes));
            if (!ok) continue;
        }

        return rule;
    }
    return null;
}

function discountedUnitPrice(precioLista, rule) {
    if (!rule) return precioLista;
    if (rule.modo === 'gratis') return 0;
    if (rule.modo === 'precio_fijo') return roundMoney(Math.max(0, Number(rule.valor) || 0));
    const pct = Math.min(100, Math.max(0, Number(rule.valor) || 0));
    return roundMoney(precioLista * (1 - pct / 100));
}

/**
 * @returns quote breakdown
 */
export function quoteEventTickets({ event, tipoEntradaId, cantidad, context }) {
    const qty = Math.max(1, Math.floor(Number(cantidad) || 0));
    if (!qty) {
        const err = new Error('Indicá una cantidad válida.');
        err.statusCode = 400;
        throw err;
    }

    const tipo = (event.tiposEntrada || []).find((t) => idsEqual(t._id, tipoEntradaId));
    if (!tipo || !tipo.activo) {
        const err = new Error('Tipo de entrada no disponible.');
        err.statusCode = 400;
        throw err;
    }

    const disponibles = Math.max(0, Number(tipo.cupo) - Number(tipo.vendidas || 0));
    if (qty > disponibles) {
        const err = new Error(
            disponibles <= 0
                ? 'No quedan entradas de este tipo.'
                : `Solo quedan ${disponibles} entrada(s) de este tipo.`,
        );
        err.statusCode = 400;
        throw err;
    }

    const precioLista = roundMoney(Number(tipo.precio) || 0);
    const rule = matchRule(event, context || {});
    const descuentoBloqueadoPorDeuda = !!(context?.tieneVencidos && context?.rol);

    let precioConDescuento = precioLista;
    let cantidadConDescuento = 0;
    let cantidadPrecioLleno = qty;
    let reglaAplicada = null;

    if (rule) {
        precioConDescuento = discountedUnitPrice(precioLista, rule);
        const maxDesc = Math.max(1, Math.floor(Number(rule.maxEntradasConDescuento) || 1));
        cantidadConDescuento = Math.min(qty, maxDesc);
        cantidadPrecioLleno = qty - cantidadConDescuento;
        reglaAplicada = {
            id: rule._id || null,
            nombre: rule.nombre || null,
            modo: rule.modo,
            valor: rule.valor,
            maxEntradasConDescuento: maxDesc,
        };
    }

    const montoTotal = roundMoney(
        cantidadConDescuento * precioConDescuento + cantidadPrecioLleno * precioLista,
    );

    return {
        tipoEntradaId: String(tipo._id),
        tipoEntradaNombre: tipo.nombre,
        cantidad: qty,
        disponibles,
        precioLista,
        precioConDescuento,
        cantidadConDescuento,
        cantidadPrecioLleno,
        montoTotal,
        reglaAplicada,
        descuentoBloqueadoPorDeuda,
    };
}
