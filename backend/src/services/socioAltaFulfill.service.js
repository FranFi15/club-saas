import crypto from 'crypto';
import {
    DEFAULT_CLUB_TIMEZONE,
    resolveSocioAltaBillingPeriod,
    zonedWallTimeToDate,
} from '../utils/timeHelper.js';
import { sendEmail, isEmailConfigured } from './email.service.js';
import { syncAthleteCountToSuper } from './athleteQuota.service.js';
import { createAppNotificationsMany } from './appNotification.service.js';
import { roleQueryMany } from '../constants/userRoles.js';

function generateTempPassword(length = 10) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

async function sendWelcomeEmail({
    to,
    clubNombre,
    clubIdentifier,
    tempPassword,
}) {
    if (!isEmailConfigured()) {
        console.warn('[socio-alta] RESEND_API_KEY ausente — no se envió email de bienvenida.');
        return { sent: false, reason: 'email_not_configured' };
    }
    const appUrl = String(process.env.FRONTEND_URL || 'https://app.hermesclubapp.com')
        .split(',')[0]
        ?.trim()
        .replace(/\/$/, '');
    const subject = `${clubNombre || 'Club'} — tu acceso de socio`;
    const text = [
        `¡Bienvenido/a a ${clubNombre || 'el club'}!`,
        '',
        'Tu cuenta de socio ya está activa.',
        `Email: ${to}`,
        `Contraseña temporal: ${tempPassword}`,
        '',
        `Código del club: ${clubIdentifier || ''}`,
        appUrl ? `Entrá en: ${appUrl}` : '',
        '',
        'Te recomendamos cambiar la contraseña desde “Olvidé mi contraseña” luego del primer ingreso.',
    ]
        .filter(Boolean)
        .join('\n');

    const html = `
      <p>¡Bienvenido/a a <strong>${clubNombre || 'el club'}</strong>!</p>
      <p>Tu cuenta de socio ya está activa.</p>
      <ul>
        <li><strong>Email:</strong> ${to}</li>
        <li><strong>Contraseña temporal:</strong> ${tempPassword}</li>
        <li><strong>Código del club:</strong> ${clubIdentifier || ''}</li>
      </ul>
      ${appUrl ? `<p>Entrá en: <a href="${appUrl}">${appUrl}</a></p>` : ''}
      <p>Te recomendamos cambiar la contraseña desde “Olvidé mi contraseña” luego del primer ingreso.</p>
    `;

    try {
        await sendEmail({ to, subject, html, text });
        return { sent: true };
    } catch (e) {
        console.error('[socio-alta] email:', e.message);
        return { sent: false, reason: e.message };
    }
}

/**
 * Create socio user + paid social Payment from a paid SocioAltaPending.
 * Idempotent if already pagado with userId.
 */
export async function fulfillSocioAltaPending(
    models,
    pending,
    {
        mpPaymentId = '',
        clubIdentifier = '',
        clubNombre = '',
        clubTimezone = DEFAULT_CLUB_TIMEZONE,
    } = {},
) {
    const { User, Payment, SocialFee, SocioAltaPending, ClubSettings } = models;
    if (!pending) {
        return { applied: false, reason: 'pending_missing' };
    }

    if (pending.estado === 'pagado' && pending.userId) {
        return {
            applied: false,
            reason: 'already_applied',
            idempotent: true,
            userId: String(pending.userId),
        };
    }

    if (pending.estado !== 'pendiente_pago' && pending.estado !== 'pagado') {
        return { applied: false, reason: `estado_${pending.estado}` };
    }

    const email = String(pending.email || '').toLowerCase().trim();
    const existing = await User.findOne({ email }).select('_id').lean();
    if (existing) {
        pending.estado = 'cancelado';
        await pending.save();
        return { applied: false, reason: 'email_already_registered', userId: String(existing._id) };
    }

    const fee = await SocialFee.findById(pending.socialFee).lean();
    if (!fee) {
        return { applied: false, reason: 'fee_missing' };
    }

    let corteDia = 28;
    try {
        const settings = await ClubSettings.findOne().select('altaSocioCorteDia').lean();
        if (settings?.altaSocioCorteDia != null) {
            corteDia = Number(settings.altaSocioCorteDia) || 28;
        }
    } catch {
        /* keep default */
    }
    const billing = resolveSocioAltaBillingPeriod(new Date(), clubTimezone, corteDia);
    const { mes, anio } = billing;

    const tempPassword = generateTempPassword(10);
    const user = await User.create({
        nombre: pending.nombre,
        apellido: pending.apellido,
        email,
        dni: pending.dni,
        telefono: pending.telefono || '',
        direccion: pending.direccion || '',
        fechaNacimiento: pending.fechaNacimiento || undefined,
        sexo: pending.sexo === 'M' || pending.sexo === 'F' ? pending.sexo : '',
        password: tempPassword,
        rol: 'socio',
        roles: ['socio'],
        estado: 'activo',
        dniFotoFrente: pending.dniFotoFrente || '',
        dniFotoDorso: pending.dniFotoDorso || '',
        exentoCuotaSocial: false,
        cuotaSocialAsignada: fee._id,
        cuotaSocialDesdeMes: mes,
        cuotaSocialDesdeAnio: anio,
    });

    const diaVenc = fee.diaVencimiento || 10;
    const ymd = `${anio}-${String(mes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;
    const monto = Number(pending.monto) || Number(fee.monto) || 0;

    let payment = await Payment.findOne({ atleta: user._id, tipo: 'social', mes, anio });
    if (!payment) {
        payment = await Payment.create({
            atleta: user._id,
            tipo: 'social',
            cuotaSocial: fee._id,
            mes,
            anio,
            montoOriginal: monto,
            descuentoAplicado: 0,
            montoFinal: monto,
            fechaVencimiento: zonedWallTimeToDate(ymd, '23:59', clubTimezone),
            estado: 'pagado',
            metodoPago: 'mercado_pago',
            fechaPago: new Date(),
            comprobante: mpPaymentId || '',
            origenPago: 'mercado_pago',
        });
    } else if (payment.estado !== 'pagado') {
        payment.estado = 'pagado';
        payment.metodoPago = 'mercado_pago';
        payment.fechaPago = new Date();
        payment.comprobante = mpPaymentId || payment.comprobante || '';
        payment.origenPago = 'mercado_pago';
        payment.montoFinal = monto;
        await payment.save();
    }

    pending.estado = 'pagado';
    pending.mpPaymentId = mpPaymentId || pending.mpPaymentId || '';
    pending.userId = user._id;
    await pending.save();

    try {
        await syncAthleteCountToSuper(models, clubIdentifier);
    } catch (e) {
        console.log('[socio-alta] sync count:', e.message);
    }

    const emailResult = await sendWelcomeEmail({
        to: email,
        clubNombre,
        clubIdentifier,
        tempPassword,
    });

    try {
        const admins = await User.find({
            ...roleQueryMany(['admin_club', 'administrativo']),
            estado: { $ne: 'inactivo' },
        })
            .select('_id')
            .lean();
        const nombreCompleto = `${pending.nombre || ''} ${pending.apellido || ''}`.trim() || email;
        await createAppNotificationsMany(
            models,
            admins.map((a) => a._id),
            {
                tipo: 'socio_alta',
                titulo: 'Nuevo socio aprobado',
                mensaje: `${nombreCompleto} completó el alta pública y ya está activo.`,
                referencia: pending._id,
            },
        );
    } catch (e) {
        console.warn('[socio-alta] push admins:', e.message);
    }

    return {
        applied: true,
        userId: String(user._id),
        paymentId: String(payment._id),
        email: emailResult,
        billingPeriod: { mes, anio, cutoffDay: billing.cutoffDay, appliedNext: billing.appliedNext },
    };
}

export async function fulfillSocioAltaById(models, pendingId, opts = {}) {
    const { SocioAltaPending } = models;
    const pending = await SocioAltaPending.findById(pendingId);
    if (!pending) return { applied: false, reason: 'pending_not_found' };
    return fulfillSocioAltaPending(models, pending, opts);
}
