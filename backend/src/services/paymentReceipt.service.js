import PDFDocument from 'pdfkit';
import { cloudinary } from '../config/cloudinary.js';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMoney(n) {
    return `$${Number(n || 0).toLocaleString('es-AR')}`;
}

function metodoLabel(m) {
    const map = {
        efectivo: 'Efectivo',
        transferencia: 'Transferencia',
        mercado_pago: 'Mercado Pago',
        otro: 'Otro',
    };
    return map[m] || m || '—';
}

function buildPdfBuffer({ clubNombre, payment, atleta }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const periodo = `${MESES[(payment.mes || 1) - 1]} ${payment.anio}`;
        const nombreAtleta = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim() || 'Atleta';
        const fechaPago = payment.fechaPago
            ? new Date(payment.fechaPago).toLocaleString('es-AR')
            : '—';

        doc.fontSize(18).text(clubNombre || 'Hermes Club', { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(12).fillColor('#555').text('Comprobante de pago');
        doc.fillColor('#000');
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
        doc.moveDown();

        doc.fontSize(11);
        doc.text(`Atleta: ${nombreAtleta}`);
        doc.text(`Período: ${periodo}`);
        doc.text(`Concepto: ${payment.plan?.nombre || 'Cuota'}`);
        if (payment.categoria?.nombre) doc.text(`Categoría: ${payment.categoria.nombre}`);
        doc.text(`Método: ${metodoLabel(payment.metodoPago)}`);
        doc.text(`Fecha de pago: ${fechaPago}`);
        doc.moveDown();
        if (payment.descuentoAplicado > 0) {
            doc.text(`Monto original: ${formatMoney(payment.montoOriginal)}`);
            doc.text(`Descuento: -${formatMoney(payment.descuentoAplicado)}`);
        }
        doc.fontSize(14).text(`Total pagado: ${formatMoney(payment.montoFinal)}`, { underline: true });
        doc.moveDown(2);
        doc.fontSize(9).fillColor('#777').text(
            `Comprobante generado por Hermes Club App · ID ${payment._id}`,
            { align: 'left' },
        );
        doc.end();
    });
}

async function uploadPdfBuffer(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'raw',
                folder: 'gpsports_recibos',
                public_id: publicId,
                format: 'pdf',
                overwrite: true,
            },
            (err, result) => {
                if (err) reject(err);
                else resolve(result);
            },
        );
        stream.end(buffer);
    });
}

/**
 * Genera (o reutiliza) el PDF de recibo para una cuota pagada.
 * @returns {{ url: string, created: boolean }}
 */
export async function ensurePaymentReceipt(models, paymentId, { clubNombre } = {}) {
    const { Payment } = models;
    const payment = await Payment.findById(paymentId)
        .populate('plan', 'nombre')
        .populate('categoria', 'nombre')
        .populate('atleta', 'nombre apellido email');

    if (!payment) {
        const err = new Error('Cuota no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (payment.estado !== 'pagado') {
        const err = new Error('Solo se emite comprobante de cuotas pagadas.');
        err.statusCode = 400;
        throw err;
    }

    if (payment.reciboUrl) {
        return { url: payment.reciboUrl, created: false, payment };
    }

    const buffer = await buildPdfBuffer({
        clubNombre,
        payment,
        atleta: payment.atleta,
    });
    const publicId = `recibo_${String(payment._id)}`;
    const uploaded = await uploadPdfBuffer(buffer, publicId);
    const url = uploaded.secure_url || uploaded.url;

    payment.reciboUrl = url;
    await payment.save();

    return { url, created: true, payment };
}

/** Fire-and-forget tras marcar pagado (no bloquea la respuesta HTTP). */
export function queuePaymentReceipt(models, paymentId, clubNombre) {
    setImmediate(() => {
        ensurePaymentReceipt(models, paymentId, { clubNombre }).catch((e) => {
            console.warn('[recibo] no se pudo generar:', e.message);
        });
    });
}
