import { createWorker } from 'tesseract.js';
import { normalizeDniDigits } from '../utils/dniPhotos.js';

function normalizeNameToken(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
}

function textHasDocumentoKeyword(text) {
    const t = String(text || '').toUpperCase();
    return (
        t.includes('DOCUMENTO') ||
        t.includes('IDENTIDAD') ||
        t.includes('ARGENTINA') ||
        t.includes('REPUBLICA') ||
        t.includes('REPÚBLICA')
    );
}

function extractCandidateDnis(text) {
    const raw = String(text || '');
    const matches = raw.match(/\b\d{7,9}\b/g) || [];
    const fromGrouped = (raw.match(/\b\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}\b/g) || []).map((m) =>
        normalizeDniDigits(m),
    );
    const digits = [...matches.map(normalizeDniDigits), ...fromGrouped].filter(
        (d) => d.length >= 7 && d.length <= 9,
    );
    return [...new Set(digits)];
}

async function ocrImageUrl(url, worker) {
    const { data } = await worker.recognize(url);
    return String(data?.text || '');
}

/**
 * Light DNI check: OCR frente (+ dorso) and require extracted digits match form DNI.
 * Soft extras: documento keywords + fuzzy nombre/apellido when present.
 */
export async function checkDniPhotosMatchForm({
    dniFotoFrente,
    dniFotoDorso,
    dni,
    nombre,
    apellido,
}) {
    const expected = normalizeDniDigits(dni);
    if (!expected || expected.length < 7) {
        return { ok: false, reason: 'Ingresá un DNI válido (7 a 9 dígitos).' };
    }
    if (!dniFotoFrente || !dniFotoDorso) {
        return { ok: false, reason: 'Subí las fotos del frente y dorso del DNI.' };
    }

    let worker;
    try {
        // eng is enough to read DNI digits; lighter download than spa+eng on small hosts.
        worker = await createWorker('eng', 1, {
            logger: () => {},
        });
        const texts = [];
        texts.push(await ocrImageUrl(dniFotoFrente, worker));
        if (dniFotoDorso) {
            texts.push(await ocrImageUrl(dniFotoDorso, worker));
        }
        const combined = texts.join('\n');
        const candidates = extractCandidateDnis(combined);
        const matchedDni = candidates.includes(expected);

        if (!matchedDni) {
            return {
                ok: false,
                reason:
                    'No pudimos leer tu DNI en las fotos o no coincide con el número ingresado. Subí fotos nítidas del frente y dorso.',
                meta: {
                    matchedDni: false,
                    matchedName: false,
                    hadDocumentoKeyword: textHasDocumentoKeyword(combined),
                },
            };
        }

        const nameTokens = [normalizeNameToken(apellido), normalizeNameToken(nombre)].filter(
            (t) => t.length >= 3,
        );
        const upperText = normalizeNameToken(combined);
        const matchedName =
            nameTokens.length === 0
                ? false
                : nameTokens.every((t) => upperText.includes(t));

        return {
            ok: true,
            reason: null,
            meta: {
                matchedDni: true,
                matchedName,
                hadDocumentoKeyword: textHasDocumentoKeyword(combined),
            },
        };
    } catch (e) {
        console.error('[dni-ocr]', e.message);
        return {
            ok: false,
            reason:
                'No pudimos verificar las fotos del DNI. Probá de nuevo con imágenes más claras (JPG/PNG).',
            meta: { matchedDni: false, matchedName: false, hadDocumentoKeyword: false },
        };
    } finally {
        if (worker) {
            try {
                await worker.terminate();
            } catch {
                /* ignore */
            }
        }
    }
}
