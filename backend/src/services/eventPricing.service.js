import { EVENT_MEMBER_ROLES } from '../models/clubEvent.model.js';
import { hijosDelTutorFilter } from '../utils/userQuery.js';
import { normalizeTicketDni } from './eventTicketIssue.service.js';

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

function foldName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function sameHolder(holder, person) {
    const dni = normalizeTicketDni(holder?.dni);
    if (!dni || !person?.dni || dni !== person.dni) return false;
    return foldName(holder?.nombre) === foldName(person.nombre)
        && foldName(holder?.apellido) === foldName(person.apellido);
}

/**
 * People whose member discount this buyer may use: themselves, and a tutor's athletes.
 * The discount still applies only when the ticket name and DNI match that person.
 */
export async function resolveDiscountPeople(models, buyer) {
    if (!buyer?._id && !buyer?.id) return [];
    const people = [buyer];
    if (buyer.rol === 'tutor' && models?.User) {
        const hijos = await models.User.find(hijosDelTutorFilter(buyer._id || buyer.id))
            .select('nombre apellido dni rol cuotaSocialAsignada')
            .lean();
        people.push(...hijos);
    }
    const eligible = [];
    for (const user of people) {
        if (!user?._id && !user?.id) continue;
        eligible.push({
            userId: String(user._id || user.id),
            nombre: user.nombre || '',
            apellido: user.apellido || '',
            dni: normalizeTicketDni(user.dni),
            context: await resolveBuyerContext(models, user),
        });
    }
    return eligible;
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
export function quoteEventTickets({ event, tipoEntradaId, cantidad, holders, eligible }) {
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
    const people = Array.isArray(eligible) ? eligible : [];
    const rawHolders = Array.isArray(holders) ? holders : [];
    const usedByPerson = new Map();
    let descuentoBloqueadoPorDeuda = false;

    const lineas = Array.from({ length: qty }, (_, index) => {
        const holder = rawHolders[index] || {};
        const person = people.find((item) => sameHolder(holder, item));
        const titular = [holder.nombre, holder.apellido].filter(Boolean).join(' ').trim();
        if (!person) {
            return { precio: precioLista, conDescuento: false, titular };
        }
        if (person.context?.tieneVencidos && person.context?.rol) {
            descuentoBloqueadoPorDeuda = true;
            return { precio: precioLista, conDescuento: false, titular, bloqueadoPorDeuda: true };
        }
        const rule = matchRule(event, person.context || {});
        if (!rule) return { precio: precioLista, conDescuento: false, titular };
        const maxDesc = Math.max(1, Math.floor(Number(rule.maxEntradasConDescuento) || 1));
        const used = usedByPerson.get(person.userId) || 0;
        if (used >= maxDesc) return { precio: precioLista, conDescuento: false, titular };
        usedByPerson.set(person.userId, used + 1);
        return {
            precio: discountedUnitPrice(precioLista, rule),
            conDescuento: true,
            titular: titular || [person.nombre, person.apellido].filter(Boolean).join(' ').trim(),
            regla: {
                id: rule._id || null,
                nombre: rule.nombre || null,
                modo: rule.modo,
                valor: rule.valor,
                maxEntradasConDescuento: maxDesc,
            },
        };
    });

    const discounted = lineas.filter((line) => line.conDescuento);
    const cantidadConDescuento = discounted.length;
    const cantidadPrecioLleno = qty - cantidadConDescuento;
    const precioConDescuento = cantidadConDescuento ? discounted[0].precio : precioLista;
    const ruleNames = [...new Set(discounted.map((line) => line.regla?.nombre).filter(Boolean))];
    const reglaAplicada = discounted.length
        ? {
            id: discounted[0].regla?.id || null,
            nombre: ruleNames.join(' · ') || null,
            modo: discounted[0].regla?.modo,
            valor: discounted[0].regla?.valor,
            maxEntradasConDescuento: discounted[0].regla?.maxEntradasConDescuento,
        }
        : null;

    const montoTotal = roundMoney(lineas.reduce((sum, line) => sum + line.precio, 0));

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
        lineas: lineas.map((line) => ({
            precio: line.precio,
            conDescuento: line.conDescuento,
            titular: line.titular || '',
            reglaNombre: line.regla?.nombre || '',
            bloqueadoPorDeuda: !!line.bloqueadoPorDeuda,
        })),
    };
}
