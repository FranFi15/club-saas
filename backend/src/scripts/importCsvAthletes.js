/**
 * Importa usuarios desde CSVs (NIF → dni). Solo crea User, sin inscribir en categorías.
 * Si el DNI ya existe (en DB o repetido entre CSVs), se omite.
 *
 *   cd backend
 *   IMPORT_CSV_DIR="C:/Users/Prueba/Downloads/Nueva carpeta" SEED_CLUB_IDENTIFIER=altense node src/scripts/importCsvAthletes.js
 *   DRY_RUN=1 ...
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { resolveAthleteEmail } from '../utils/athleteLoginEmail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../super/.env') });

const CLUB_ID = String(process.env.SEED_CLUB_IDENTIFIER || process.env.SEED_CLUB || 'altense')
    .toLowerCase()
    .trim();
const CSV_DIR = process.env.IMPORT_CSV_DIR
    || path.resolve('C:/Users/Prueba/Downloads/Nueva carpeta');
const PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || 'Altense2026!';
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === '1'
    || String(process.env.DRY_RUN || '').toLowerCase() === 'true';

function normalizeKey(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function mapRole(tipoRaw) {
    const t = normalizeKey(tipoRaw);
    if (t.includes('entrenador') || t.includes('ent. ayudante') || t.includes('ent ayudante')) {
        return 'profe';
    }
    if (t.includes('prep') || t === 'trainer' || t.includes('fisico')) {
        return 'preparador_fisico';
    }
    return 'atleta';
}

function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(';').map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(';');
        if (cols.every((c) => !String(c || '').trim())) continue;
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = (cols[idx] ?? '').trim();
        });
        rows.push(row);
    }
    return rows;
}

function parseNombre(raw) {
    const s = String(raw || '').trim();
    if (!s) return { nombre: '', apellido: '' };
    if (s.includes(',')) {
        const [ap, ...rest] = s.split(',');
        return {
            apellido: ap.trim(),
            nombre: rest.join(',').trim() || 'SinNombre',
        };
    }
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { nombre: parts[0], apellido: parts[0] };
    return { apellido: parts[0], nombre: parts.slice(1).join(' ') };
}

function parseDateDMY(raw) {
    const m = String(raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
}

function titleCaseName(s) {
    return String(s || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

async function resolveClubConnection() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('Falta MONGO_URI (super/.env).');

    const superConn = await mongoose.createConnection(mongoUri).asPromise();
    const club = await superConn.db.collection('clubs').findOne({ urlIdentifier: CLUB_ID });
    await superConn.close();
    if (!club) throw new Error(`Club "${CLUB_ID}" no encontrado en superadmin.`);
    if (!club.connectionStringDB) throw new Error(`Club "${CLUB_ID}" sin connectionStringDB.`);
    const cs = String(club.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
    const db = await getTenantDB(CLUB_ID, cs);
    return { db, clubNombre: club.nombre || CLUB_ID };
}

async function main() {
    if (!fs.existsSync(CSV_DIR)) {
        throw new Error(`No existe IMPORT_CSV_DIR: ${CSV_DIR}`);
    }

    const files = fs.readdirSync(CSV_DIR)
        .filter((f) => f.toLowerCase().endsWith('.csv'))
        .sort();
    if (!files.length) throw new Error(`No hay CSV en ${CSV_DIR}`);

    console.log(`Club: ${CLUB_ID}`);
    console.log(`CSV dir: ${CSV_DIR} (${files.length} archivos)`);
    console.log('Modo: solo usuarios (sin categorías)');
    console.log(DRY_RUN ? 'DRY_RUN=1 (no escribe)' : 'Escribiendo en la base…');

    const { db, clubNombre } = await resolveClubConnection();
    const { User } = getTenantModels(db);
    console.log(`Club DB: ${clubNombre}`);

    const seenDnis = new Set();
    const summary = { created: 0, skippedExisting: 0, skippedDuplicateCsv: 0, skippedNoDni: 0, errors: [] };

    for (const file of files) {
        const full = path.join(CSV_DIR, file);
        const rows = parseCsv(fs.readFileSync(full, 'latin1'));
        console.log(`\n📄 ${file} (${rows.length} filas)`);

        for (const row of rows) {
            const dni = String(row.NIF || row.DNI || '').replace(/\D/g, '').trim();
            const { nombre: nomRaw, apellido: apeRaw } = parseNombre(row.NOMBRE);
            const nombre = titleCaseName(nomRaw);
            const apellido = titleCaseName(apeRaw);
            if (!nombre || !apellido) {
                summary.skippedNoDni += 1;
                continue;
            }
            if (!dni) {
                console.log(`  ⊘ sin NIF: ${apellido}, ${nombre}`);
                summary.skippedNoDni += 1;
                continue;
            }

            if (seenDnis.has(dni)) {
                summary.skippedDuplicateCsv += 1;
                continue;
            }
            seenDnis.add(dni);

            const emailCsv = String(row.EMAIL || '').trim().toLowerCase();
            const telefono = String(row.TELEFONO || '').replace(/\D/g, '').trim() || undefined;
            const fechaNacimiento = parseDateDMY(row['FECHA NACIMIENTO'] || row.FECHA_NACIMIENTO);
            const rol = mapRole(row.TIPO);

            try {
                const existing = await User.findOne({ dni }).select('_id nombre apellido').lean();
                if (existing) {
                    console.log(`  ⊘ ya existe dni=${dni}: ${existing.apellido}, ${existing.nombre}`);
                    summary.skippedExisting += 1;
                    continue;
                }

                if (DRY_RUN) {
                    console.log(`  + ${apellido}, ${nombre} dni=${dni} rol=${rol}`);
                    summary.created += 1;
                    continue;
                }

                const emailResolved = await resolveAthleteEmail(User, {
                    email: emailCsv,
                    nombre,
                    apellido,
                    clubIdentifier: CLUB_ID,
                });

                await User.create({
                    nombre,
                    apellido,
                    dni,
                    email: emailResolved.email,
                    password: PASSWORD,
                    rol,
                    roles: [rol],
                    telefono,
                    fechaNacimiento: fechaNacimiento || undefined,
                    estado: 'activo',
                    cuotasEnApp: rol === 'atleta',
                });
                console.log(`  ✓ ${apellido}, ${nombre} dni=${dni} (${rol})`);
                summary.created += 1;
            } catch (e) {
                summary.errors.push(`${apellido}, ${nombre} (${dni}): ${e.message}`);
                console.error(`  ✗ ${apellido}, ${nombre}: ${e.message}`);
            }
        }
    }

    console.log('\n—— Resumen ——');
    console.log(`Creados: ${summary.created}`);
    console.log(`Omitidos (ya en DB): ${summary.skippedExisting}`);
    console.log(`Omitidos (DNI repetido en CSV): ${summary.skippedDuplicateCsv}`);
    console.log(`Omitidos (sin NIF/nombre): ${summary.skippedNoDni}`);
    if (summary.errors.length) {
        console.log(`Errores (${summary.errors.length}):`);
        summary.errors.slice(0, 20).forEach((e) => console.log(`  - ${e}`));
    }
    if (!DRY_RUN) console.log(`Password default (nuevos): ${PASSWORD}`);

    await mongoose.disconnect();
    process.exit(summary.errors.length ? 1 : 0);
}

main().catch(async (e) => {
    console.error(e);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
