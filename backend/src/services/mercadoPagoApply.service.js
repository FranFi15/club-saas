import axios from 'axios';
import { amountsMatch } from '../utils/mpWebhookSignature.js';
import { applyMercadoPagoToRental } from '../utils/rentalPayments.js';

export function parseExternalRef(externalRef) {
    if (!externalRef || typeof externalRef !== 'string') return { tipo: null, dbId: null, extra: null };
    const i = externalRef.indexOf('_');
    if (i <= 0) return { tipo: null, dbId: null, extra: null };
    const tipo = externalRef.slice(0, i);
    const rest = externalRef.slice(i + 1);
    if (tipo === 'alquiler') {
        const j = rest.indexOf('_');
        if (j > 0) {
            return { tipo, dbId: rest.slice(0, j), extra: rest.slice(j + 1) };
        }
        return { tipo, dbId: rest, extra: null };
    }
    return { tipo, dbId: rest, extra: null };
}

async function markProcessed(models, payload) {
    const { MpProcessedPayment } = models;
    if (!MpProcessedPayment) return;
    try {
        await MpProcessedPayment.findOneAndUpdate(
            { mpPaymentId: payload.mpPaymentId },
            {
                $set: {
                    externalReference: payload.externalReference || '',
                    tipo: payload.tipo || '',
                    appliedIds: payload.appliedIds || [],
                    status: payload.status || 'applied',
                    reason: payload.reason || '',
                },
                $setOnInsert: { mpPaymentId: payload.mpPaymentId },
            },
            { upsert: true, new: true },
        );
    } catch (e) {
        if (e?.code !== 11000) {
            console.warn('[mp-apply] no se pudo registrar idempotencia:', e.message);
        }
    }
}

/**
 * Aplica un pago aprobado de MP a cuotas/alquiler (atómico + idempotente).
 * El pago debe venir de la API de MP con el token del club.
 */
export async function applyApprovedMercadoPagoPayment(models, paymentData) {
    if (!paymentData || paymentData.status !== 'approved') {
        return { applied: false, reason: 'not_approved' };
    }

    const paymentId = String(paymentData.id);
    const externalRef = paymentData.external_reference || '';
    const { tipo, dbId, extra } = parseExternalRef(externalRef);
    const paidAmount = Number(paymentData.transaction_amount);
    const { Payment, Rental, MpProcessedPayment } = models;

    if (MpProcessedPayment) {
        const prior = await MpProcessedPayment.findOne({ mpPaymentId: paymentId }).lean();
        if (prior?.status === 'applied') {
            return {
                applied: false,
                reason: 'already_applied',
                idempotent: true,
                ids: prior.appliedIds || [],
            };
        }
    }

    if (tipo === 'cuota' && dbId) {
        const updated = await Payment.findOneAndUpdate(
            {
                _id: dbId,
                estado: { $in: ['pendiente', 'vencido', 'en_revision'] },
            },
            {
                $set: {
                    estado: 'pagado',
                    metodoPago: 'mercado_pago',
                    fechaPago: new Date(),
                    comprobante: paymentId,
                },
            },
            { new: true },
        );

        if (updated) {
            if (!amountsMatch(updated.montoFinal, paidAmount)) {
                console.warn(
                    `[mp] monto no coincide cuota ${dbId}: esperado ${updated.montoFinal}, pagado ${paidAmount} — marcado igual`,
                );
            }
            const ids = [String(updated._id)];
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'cuota',
                appliedIds: ids,
                status: 'applied',
            });
            return { applied: true, tipo: 'cuota', ids };
        }

        const existing = await Payment.findById(dbId).select('estado comprobante').lean();
        if (!existing) {
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'cuota',
                status: 'skipped',
                reason: 'cuota_not_found',
            });
            return { applied: false, reason: 'cuota_not_found' };
        }
        if (existing.estado === 'pagado') {
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'cuota',
                appliedIds: [String(existing._id || dbId)],
                status: 'applied',
                reason: 'already_pagado',
            });
            return { applied: false, reason: 'already_applied', idempotent: true, ids: [String(dbId)] };
        }
        return { applied: false, reason: 'bad_state' };
    }

    if (tipo === 'cuotas_bulk' && dbId) {
        const bulkIds = dbId.split(',').filter(Boolean);
        if (!bulkIds.length) return { applied: false, reason: 'empty_bulk' };

        const pending = await Payment.find({
            _id: { $in: bulkIds },
            estado: { $in: ['pendiente', 'vencido', 'en_revision'] },
        });

        if (!pending.length) {
            const already = await Payment.countDocuments({
                _id: { $in: bulkIds },
                estado: 'pagado',
            });
            if (already > 0) {
                await markProcessed(models, {
                    mpPaymentId: paymentId,
                    externalReference: externalRef,
                    tipo: 'cuotas_bulk',
                    appliedIds: bulkIds,
                    status: 'applied',
                    reason: 'already_pagado',
                });
                return { applied: false, reason: 'already_applied', idempotent: true, ids: bulkIds };
            }
            return { applied: false, reason: 'cuota_not_found' };
        }

        const expected = pending.reduce((s, p) => s + (Number(p.montoFinal) || 0), 0);
        if (!amountsMatch(expected, paidAmount)) {
            console.warn(
                `[mp] monto no coincide bulk: esperado ${expected}, pagado ${paidAmount} — marcado igual`,
            );
        }

        const ids = pending.map((c) => String(c._id));
        await Payment.updateMany(
            { _id: { $in: pending.map((c) => c._id) } },
            {
                $set: {
                    estado: 'pagado',
                    metodoPago: 'mercado_pago',
                    fechaPago: new Date(),
                    comprobante: paymentId,
                },
            },
        );
        await markProcessed(models, {
            mpPaymentId: paymentId,
            externalReference: externalRef,
            tipo: 'cuotas_bulk',
            appliedIds: ids,
            status: 'applied',
        });
        return { applied: true, tipo: 'cuotas_bulk', ids };
    }

    if (tipo === 'alquiler' && dbId) {
        const rental = await Rental.findById(dbId);
        if (!rental) {
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'alquiler',
                status: 'skipped',
                reason: 'rental_not_found',
            });
            return { applied: false, reason: 'rental_not_found' };
        }
        const result = applyMercadoPagoToRental(rental, {
            paymentId,
            transactionAmount: paymentData.transaction_amount,
            conceptoKey: extra || 'total',
        });
        if (result.applied) {
            await rental.save();
            const ids = [String(rental._id)];
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'alquiler',
                appliedIds: ids,
                status: 'applied',
            });
            return { applied: true, tipo: 'alquiler', ids };
        }
        if (result.reason === 'already_applied' || result.reason === 'already_paid') {
            await markProcessed(models, {
                mpPaymentId: paymentId,
                externalReference: externalRef,
                tipo: 'alquiler',
                appliedIds: [String(rental._id)],
                status: 'applied',
                reason: result.reason,
            });
            return { applied: false, reason: 'already_applied', idempotent: true, ids: [String(rental._id)] };
        }
        return { applied: false, reason: result.reason || 'rental_not_applied' };
    }

    await markProcessed(models, {
        mpPaymentId: paymentId,
        externalReference: externalRef,
        status: 'skipped',
        reason: 'unknown_ref',
    });
    return { applied: false, reason: 'unknown_ref' };
}

export async function searchApprovedMpPaymentByExternalRef(accessToken, externalReference) {
    const { data } = await axios.get('https://api.mercadopago.com/v1/payments/search', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            sort: 'date_created',
            criteria: 'desc',
            external_reference: externalReference,
        },
    });
    const results = data?.results || [];
    return results.find((p) => p.status === 'approved') || null;
}

export async function searchRecentApprovedMpPayments(accessToken, { days = 30, limit = 100 } = {}) {
    const begin = new Date(Date.now() - Math.max(1, days) * 86400000);
    const end = new Date();
    const { data } = await axios.get('https://api.mercadopago.com/v1/payments/search', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            status: 'approved',
            sort: 'date_created',
            criteria: 'desc',
            range: 'date_created',
            begin_date: begin.toISOString(),
            end_date: end.toISOString(),
            limit: Math.min(Math.max(limit, 1), 100),
        },
    });
    return data?.results || [];
}

/**
 * Reconciliación: pagos MP aprobados → cuotas aún pendientes.
 * 1) Recientes en MP por fecha
 * 2) Cuotas abiertas locales buscadas por external_reference
 */
export async function reconcileClubMercadoPagoPayments(models, accessToken, options = {}) {
    const days = Number(options.days) > 0 ? Number(options.days) : 30;
    const unpaidLimit = Number(options.unpaidLimit) > 0 ? Number(options.unpaidLimit) : 80;
    const { Payment } = models;

    const updated = new Set();
    const inspectedMp = new Set();
    let appliedCount = 0;
    let idempotentCount = 0;

    const recent = await searchRecentApprovedMpPayments(accessToken, { days, limit: 100 });
    for (const paymentData of recent) {
        const ref = paymentData?.external_reference || '';
        if (!/^(cuota_|cuotas_bulk_|alquiler_)/.test(ref)) continue;
        inspectedMp.add(String(paymentData.id));
        const result = await applyApprovedMercadoPagoPayment(models, paymentData);
        if (result.applied) {
            appliedCount += 1;
            (result.ids || []).forEach((id) => updated.add(String(id)));
        } else if (result.idempotent) {
            idempotentCount += 1;
        }
    }

    const unpaid = await Payment.find({
        estado: { $in: ['pendiente', 'vencido', 'en_revision'] },
    })
        .sort({ updatedAt: -1 })
        .limit(unpaidLimit)
        .select('_id')
        .lean();

    for (const row of unpaid) {
        const id = String(row._id);
        if (updated.has(id)) continue;
        const found = await searchApprovedMpPaymentByExternalRef(accessToken, `cuota_${id}`);
        if (!found) continue;
        inspectedMp.add(String(found.id));
        const result = await applyApprovedMercadoPagoPayment(models, found);
        if (result.applied) {
            appliedCount += 1;
            (result.ids || []).forEach((x) => updated.add(String(x)));
        } else if (result.idempotent) {
            idempotentCount += 1;
        }
    }

    return {
        days,
        inspectedMp: inspectedMp.size,
        unpaidChecked: unpaid.length,
        applied: appliedCount,
        alreadySynced: idempotentCount,
        updatedIds: [...updated],
        synced: updated.size > 0,
    };
}
