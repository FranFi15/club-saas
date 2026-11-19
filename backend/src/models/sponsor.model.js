import mongoose from 'mongoose';

/** Clientes del club (cuotas / app de socio). */
export const SPONSOR_CLIENT_ROLES = ['atleta', 'tutor', 'socio'];

/** Personal del club (UI “Staff”): gestión, operación y cuerpo técnico. */
export const SPONSOR_STAFF_ROLES = [
    'admin_club',
    'dirigente',
    'administrativo',
    'control_ingreso',
    'colaborador',
    'profe',
    'preparador_fisico',
    'psicologo',
    'nutricionista',
];

/** Roles que pueden ver beneficios de sponsors (ampliado a staff + clientes). */
export const SPONSOR_MEMBER_ROLES = [
    ...SPONSOR_STAFF_ROLES,
    ...SPONSOR_CLIENT_ROLES,
    'partner',
];

/**
 * Expand UI tokens (`todos`, `staff`) into concrete role strings.
 * Unknown values are dropped.
 */
export function expandSponsorRoles(rolesIn) {
    if (!Array.isArray(rolesIn)) return [];
    const out = new Set();
    for (const raw of rolesIn) {
        const r = String(raw || '').trim();
        if (!r) continue;
        if (r === 'todos') {
            SPONSOR_CLIENT_ROLES.forEach((x) => out.add(x));
            SPONSOR_STAFF_ROLES.forEach((x) => out.add(x));
            continue;
        }
        if (r === 'staff') {
            SPONSOR_STAFF_ROLES.forEach((x) => out.add(x));
            continue;
        }
        if (SPONSOR_MEMBER_ROLES.includes(r)) out.add(r);
    }
    return [...out];
}

/**
 * Roles that may redeem a reward. Expands legacy `staff` / `todos` tokens.
 * Prefer per-reward rolesCanje; fall back to sponsor.rolesCanjeCreditos.
 */
export function resolveCanjeRoles(reward, sponsor) {
    const fromReward = Array.isArray(reward?.rolesCanje) ? reward.rolesCanje : [];
    const fromSponsor = Array.isArray(sponsor?.rolesCanjeCreditos)
        ? sponsor.rolesCanjeCreditos
        : [];
    const raw = fromReward.length ? fromReward : fromSponsor;
    return expandSponsorRoles(raw);
}

/**
 * Sponsors del club: aporte mensual + beneficios para miembros al día
 * según rol y/o tipo de cuota social.
 */
const sponsorSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        /** CUIT / registro / razón social corta. */
        registro: { type: String, trim: true, default: '' },
        fotoUrl: { type: String, trim: true, default: '' },
        montoMensual: { type: Number, default: 0, min: 0 },
        /** Texto libre de beneficios (líneas separadas por salto). */
        beneficios: { type: String, trim: true, default: '' },
        /** Roles alcanzados (vacío = todos los roles activos). */
        rolesAplicables: [{ type: String }],
        /**
         * Roles que pueden canjear créditos en este sponsor.
         * Vacío = nadie puede canjear (hay que elegir roles).
         */
        rolesCanjeCreditos: [{ type: String }],
        /** Tipos de cuota social alcanzados. */
        cuotasSociales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialFee' }],
        /** Partner operator users bound to this sponsor. */
        usuariosPartner: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        activo: { type: Boolean, default: true },
        /** Primer mes con control de aportes (no se generan pagos en meses anteriores). */
        desdeMes: { type: Number, min: 1, max: 12 },
        desdeAnio: { type: Number, min: 2000, max: 2100 },
    },
    { timestamps: true },
);

sponsorSchema.index({ activo: 1 });

export const getSponsorModel = (tenantDB) =>
    tenantDB.models.Sponsor || tenantDB.model('Sponsor', sponsorSchema);
