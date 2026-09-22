import mongoose from 'mongoose';
import { normalizeUserRoles } from '../constants/userRoles.js';

export const PAYROLL_STAFF_ROLES = [
    'admin_club',
    'dirigente',
    'administrativo',
    'control_ingreso',
    'colaborador',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
];

export const PAYROLL_METODOS = ['efectivo', 'transferencia', 'mercado_pago', 'otro'];

/** Personal del club o atletas marcados como jugadores pagos. */
export function isPayrollEligible(user) {
    if (!user) return false;
    const roles = normalizeUserRoles(user);
    if (roles.some((r) => PAYROLL_STAFF_ROLES.includes(r))) return true;
    return roles.includes('atleta') && user.enNomina === true;
}

const payrollEntrySchema = new mongoose.Schema(
    {
        staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        monto: { type: Number, required: true, min: 0 },
        mes: { type: Number, required: true, min: 1, max: 12 },
        anio: { type: Number, required: true, min: 2000, max: 2100 },
        fechaPago: { type: Date, default: Date.now },
        metodoPago: {
            type: String,
            enum: PAYROLL_METODOS,
            default: 'transferencia',
        },
        comprobanteUrl: { type: String, trim: true, default: '' },
        notas: { type: String, trim: true, default: '' },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

payrollEntrySchema.index({ staff: 1, anio: -1, mes: -1 });
payrollEntrySchema.index({ anio: -1, mes: -1, createdAt: -1 });

export const getPayrollEntryModel = (tenantDB) =>
    tenantDB.models.PayrollEntry || tenantDB.model('PayrollEntry', payrollEntrySchema);
