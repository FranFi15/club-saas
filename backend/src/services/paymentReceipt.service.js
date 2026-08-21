import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { cloudinary } from '../config/cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HERMES_LOGO_PATH = path.join(__dirname, '../assets/hermes-logo.png');

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const BRAND_BLUE = '#18549a';
const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width ≈ 595.28

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

function normalizeHexColor(value, fallback = BRAND_BLUE) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`;
    return fallback;
}

async function fetchClubBranding(clubIdentifier) {
    const superUrl = process.env.SUPER_ADMIN_URL?.replace(/\/$/, '');
    if (!superUrl || !clubIdentifier) return null;
    try {
        const { data } = await axios.get(
            `${superUrl}/api/clubs/public/${encodeURIComponent(clubIdentifier)}`,
            { timeout: 8000 },
        );
        return data;
    } catch (e) {
        console.warn('[recibo] branding:', e.message);
        return null;
    }
}

async function fetchImageBuffer(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const { data } = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 12000,
            maxContentLength: 3 * 1024 * 1024,
        });
        return Buffer.from(data);
    } catch (e) {
        console.warn('[recibo] logo club:', e.message);
        return null;
    }
}

function drawRoundedRect(doc, x, y, w, h, r, fillColor) {
    doc.save();
    doc.path(
        `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
            `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
            `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
            `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`,
    );
    if (fillColor) doc.fill(fillColor);
    doc.restore();
}

function safeImage(doc, source, x, y, opts) {
    try {
        if (!source) return false;
        if (typeof source === 'string' && !fs.existsSync(source)) return false;
        doc.image(source, x, y, opts);
        return true;
    } catch (e) {
        console.warn('[recibo] image:', e.message);
        return false;
    }
}

function buildPdfBuffer({
    clubNombre,
    primaryColor,
    clubLogoBuf,
    hermesLogoPath,
    payment,
    atleta,
}) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const color = normalizeHexColor(primaryColor, BRAND_BLUE);
        const periodo = `${MESES[(payment.mes || 1) - 1]} ${payment.anio}`;
        const nombreAtleta = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim() || 'Atleta';
        const fechaPago = payment.fechaPago
            ? new Date(payment.fechaPago).toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : '—';
        const emitido = new Date().toLocaleDateString('es-AR');
        const reciboId = String(payment._id).slice(-8).toUpperCase();

        // —— Header band ——
        const headerH = 118;
        doc.rect(0, 0, doc.page.width, headerH).fill(color);

        // Club logo (left) on soft badge
        const logoSize = 56;
        const logoY = 28;
        if (clubLogoBuf) {
            drawRoundedRect(doc, PAGE_MARGIN - 2, logoY - 2, logoSize + 4, logoSize + 4, 10, '#ffffff');
            safeImage(doc, clubLogoBuf, PAGE_MARGIN, logoY, {
                fit: [logoSize, logoSize],
                align: 'center',
                valign: 'center',
            });
        }

        // Club name + title
        const textLeft = clubLogoBuf ? PAGE_MARGIN + logoSize + 14 : PAGE_MARGIN;
        doc.fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(18)
            .text(clubNombre || 'Club', textLeft, 34, {
                width: CONTENT_WIDTH - (clubLogoBuf ? logoSize + 14 : 0) - 70,
                ellipsis: true,
            });
        doc.font('Helvetica')
            .fontSize(11)
            .fillColor('#e8eef6')
            .text('COMPROBANTE DE PAGO', textLeft, 60);

        // Hermes mark (right) — white badge so the black-bg asset reads cleanly
        const hermesX = doc.page.width - PAGE_MARGIN - 62;
        const hermesY = 24;
        drawRoundedRect(doc, hermesX - 4, hermesY - 4, 66, 66, 10, '#ffffff');
        safeImage(doc, hermesLogoPath, hermesX, hermesY, {
            fit: [58, 58],
            align: 'center',
            valign: 'center',
        });

        // —— Meta row ——
        let y = headerH + 28;
        doc.fillColor('#64748b')
            .font('Helvetica')
            .fontSize(9)
            .text(`Nº ${reciboId}`, PAGE_MARGIN, y);
        doc.text(`Emitido: ${emitido}`, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });

        y += 22;
        doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor('#e2e8f0').lineWidth(1).stroke();

        // —— Details card ——
        y += 18;
        const rows = [
            ['Atleta', nombreAtleta],
            ['Período', periodo],
            ['Concepto', payment.plan?.nombre || 'Cuota'],
        ];
        if (payment.categoria?.nombre) rows.push(['Categoría', payment.categoria.nombre]);
        rows.push(['Método de pago', metodoLabel(payment.metodoPago)]);
        rows.push(['Fecha de pago', fechaPago]);
        if (payment.descuentoAplicado > 0) {
            rows.push(['Monto original', formatMoney(payment.montoOriginal)]);
            rows.push(['Descuento', `−${formatMoney(payment.descuentoAplicado)}`]);
        }

        const rowH = 22;
        const cardPad = 16;
        const cardH = cardPad * 2 + rows.length * rowH;
        drawRoundedRect(doc, PAGE_MARGIN, y, CONTENT_WIDTH, cardH, 8, '#f8fafc');
        doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, cardH, 8).strokeColor('#e2e8f0').lineWidth(1).stroke();

        let rowY = y + cardPad;
        for (const [label, value] of rows) {
            doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(label, PAGE_MARGIN + cardPad, rowY, {
                width: 120,
            });
            doc.fillColor('#0f172a')
                .font('Helvetica-Bold')
                .fontSize(10)
                .text(String(value), PAGE_MARGIN + 140, rowY, {
                    width: CONTENT_WIDTH - 140 - cardPad * 2,
                });
            rowY += rowH;
        }

        // —— Total box ——
        y += cardH + 22;
        const totalH = 72;
        drawRoundedRect(doc, PAGE_MARGIN, y, CONTENT_WIDTH, totalH, 8, color);
        doc.fillColor('#e8eef6')
            .font('Helvetica')
            .fontSize(10)
            .text('TOTAL PAGADO', PAGE_MARGIN, y + 16, { width: CONTENT_WIDTH, align: 'center' });
        doc.fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(26)
            .text(formatMoney(payment.montoFinal), PAGE_MARGIN, y + 34, {
                width: CONTENT_WIDTH,
                align: 'center',
            });

        // —— Footer ——
        const footerY = doc.page.height - 64;
        doc.moveTo(PAGE_MARGIN, footerY)
            .lineTo(PAGE_MARGIN + CONTENT_WIDTH, footerY)
            .strokeColor('#e2e8f0')
            .lineWidth(1)
            .stroke();

        safeImage(doc, hermesLogoPath, PAGE_MARGIN, footerY + 10, { fit: [28, 28] });
        doc.fillColor('#64748b')
            .font('Helvetica')
            .fontSize(8)
            .text(
                'Comprobante generado por Hermes Club App. Conservalo como constancia de pago.',
                PAGE_MARGIN + 36,
                footerY + 14,
                { width: CONTENT_WIDTH - 36 },
            );
        doc.fillColor('#94a3b8')
            .fontSize(7)
            .text(`ID ${payment._id}`, PAGE_MARGIN + 36, footerY + 28, { width: CONTENT_WIDTH - 36 });

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
                type: 'upload',
                access_mode: 'public',
            },
            (err, result) => {
                if (err) reject(err);
                else resolve(result);
            },
        );
        stream.end(buffer);
    });
}

async function loadPaidPayment(models, paymentId) {
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
    return payment;
}

function receiptFilename(payment) {
    const mes = String(payment.mes || 1).padStart(2, '0');
    return `comprobante-${payment.anio}-${mes}-${String(payment._id).slice(-6)}.pdf`;
}

async function resolveReceiptContext(clubIdentifier, clubNombre) {
    const branding = await fetchClubBranding(clubIdentifier);
    const clubLogoBuf = await fetchImageBuffer(branding?.logoUrl);
    return {
        clubNombre: branding?.nombre || clubNombre || clubIdentifier || 'Club',
        primaryColor: branding?.primaryColor || BRAND_BLUE,
        clubLogoBuf,
        hermesLogoPath: HERMES_LOGO_PATH,
    };
}

/** Genera el PDF en memoria (fuente de verdad para descarga autenticada). */
export async function buildPaymentReceiptPdf(models, paymentId, { clubIdentifier, clubNombre } = {}) {
    const payment = await loadPaidPayment(models, paymentId);
    const ctx = await resolveReceiptContext(clubIdentifier || clubNombre, clubNombre);
    const buffer = await buildPdfBuffer({
        ...ctx,
        payment,
        atleta: payment.atleta,
    });
    return {
        buffer,
        payment,
        filename: receiptFilename(payment),
        mimeType: 'application/pdf',
        base64: buffer.toString('base64'),
    };
}

/**
 * Intenta cachear el PDF en Cloudinary (opcional; la descarga no depende de esto).
 */
export async function ensurePaymentReceipt(models, paymentId, { clubIdentifier, clubNombre } = {}) {
    const payment = await loadPaidPayment(models, paymentId);

    // Siempre regeneramos estilo nuevo en descarga; acá solo cache opcional.
    const ctx = await resolveReceiptContext(clubIdentifier || clubNombre, clubNombre);
    const buffer = await buildPdfBuffer({
        ...ctx,
        payment,
        atleta: payment.atleta,
    });
    const publicId = `recibo_${String(payment._id)}`;
    try {
        const uploaded = await uploadPdfBuffer(buffer, publicId);
        const url = uploaded.secure_url || uploaded.url;
        payment.reciboUrl = url;
        await payment.save();
        return { url, created: true, payment };
    } catch (e) {
        console.warn('[recibo] Cloudinary upload falló:', e.message);
        return { url: payment.reciboUrl || '', created: false, payment, error: e.message };
    }
}

/** Fire-and-forget tras marcar pagado (no bloquea la respuesta HTTP). */
export function queuePaymentReceipt(models, paymentId, clubIdentifier) {
    setImmediate(() => {
        ensurePaymentReceipt(models, paymentId, { clubIdentifier }).catch((e) => {
            console.warn('[recibo] no se pudo generar:', e.message);
        });
    });
}
