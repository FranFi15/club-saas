/**
 * Atleta demo + 17 mediciones ISAK (3 fechas) para probar Registrar y Gráfico.
 *
 * Uso (desde /backend):
 *   npm run seed:nutri
 *
 * Variables (.env) — mismas que seed:finanzas:
 *   SEED_MONGODB_URI=mongodb://...
 *   SEED_CLUB_IDENTIFIER=tu-club
 *   o SUPER_ADMIN_URL + INTERNAL_ADMIN_API_KEY + SEED_CLUB_IDENTIFIER
 *
 *   SEED_FORCE=true   → borra mediciones demo y regenera
 */
import 'dotenv/config';
import axios from 'axios';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';

const DEMO_PREFIX = 'Demo —';
const DEMO_PASSWORD = 'Demo2026!';

const DEMO_ATLETA_EMAIL = 'demo.isak@ejemplo.local';

/** Perfil restringido ISAK — 17 definiciones. */
const ISAK_PRESETS = [
  { nombre: 'Masa corporal', unidad: 'kg', mejorDireccion: 'menor_es_mejor', area: 'datos_basicos' },
  { nombre: 'Estatura', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'datos_basicos' },
  { nombre: 'Tríceps', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Subescapular', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Bíceps', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Cresta ilíaca', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Supraespinal', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Abdominal', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Muslo medial', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Pantorrilla medial', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
  { nombre: 'Brazo relajado', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
  { nombre: 'Brazo flexionado y en tensión', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
  { nombre: 'Cintura', unidad: 'cm', mejorDireccion: 'menor_es_mejor', area: 'perimetros' },
  { nombre: 'Cadera (glúteo)', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
  { nombre: 'Pantorrilla máxima', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
  { nombre: 'Biestiloideo', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'diametros_oseos' },
  { nombre: 'Bicondíleo del fémur', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'diametros_oseos' },
];

const LEGACY_ALIASES = {
  peso: 'masa corporal',
  talla: 'estatura',
};

function canonicalName(nombre) {
  const n = String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return LEGACY_ALIASES[n] || String(nombre || '').trim();
}

async function resolveTenantConnection() {
  const uri = process.env.SEED_MONGODB_URI;
  const clubId = process.env.SEED_CLUB_IDENTIFIER || process.env.SEED_CLUB;

  if (uri) {
    const id = clubId || 'seed-local';
    const db = await getTenantDB(id, uri.replace(/([^:]\/)\/+/g, '$1'));
    return { db, identifier: id };
  }

  const superUrl = process.env.SUPER_ADMIN_URL;
  const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
  if (!clubId || !superUrl || !internalKey) {
    throw new Error(
      'Configurá SEED_MONGODB_URI o bien SEED_CLUB_IDENTIFIER + SUPER_ADMIN_URL + INTERNAL_ADMIN_API_KEY en backend/.env',
    );
  }

  const { data } = await axios.get(
    `${superUrl.replace(/\/$/, '')}/api/clubs/internal/${clubId}/db-info`,
    { headers: { 'x-internal-api-key': internalKey }, timeout: 30000 },
  );
  const cs = String(data.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
  const db = await getTenantDB(clubId, cs);
  return { db, identifier: clubId };
}

async function upsertUser(User, fields) {
  const { email, passwordPlain, ...rest } = fields;
  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    Object.assign(user, rest);
    if (passwordPlain) user.password = passwordPlain;
    await user.save();
    return user;
  }
  return User.create({ ...rest, email: email.toLowerCase(), password: passwordPlain || DEMO_PASSWORD });
}

async function ensureMetricDefs(MetricDefinition, evaluadorId) {
  const existing = await MetricDefinition.find({});
  const byCanon = new Map(
    existing.map((d) => [`${d.area}::${canonicalName(d.nombre).toLowerCase()}`, d]),
  );

  const defs = [...existing];
  for (const preset of ISAK_PRESETS) {
    const key = `${preset.area}::${preset.nombre.toLowerCase()}`;
    if (byCanon.has(key)) continue;
    const legacyHit = existing.find(
      (d) =>
        d.area === preset.area &&
        canonicalName(d.nombre).toLowerCase() === preset.nombre.toLowerCase(),
    );
    if (legacyHit) {
      byCanon.set(key, legacyHit);
      continue;
    }
    const created = await MetricDefinition.create({ ...preset, creador: evaluadorId });
    defs.push(created);
    byCanon.set(key, created);
  }

  const resolve = (nombre, area) => {
    const key = `${area}::${nombre.toLowerCase()}`;
    let def = byCanon.get(key);
    if (def) return def;
    def = existing.find(
      (d) =>
        d.area === area && canonicalName(d.nombre).toLowerCase() === nombre.toLowerCase(),
    );
    return def;
  };

  return { defs, resolve };
}

/** Tres evaluaciones: mejora leve de composición (menos pliegues, mismo peso aprox). */
const SESSIONS = [
  {
    fecha: '2025-12-15T12:00:00',
    notas: `${DEMO_PREFIX} Evaluación inicial`,
    valores: {
      'Masa corporal': 76.4,
      Estatura: 178,
      Tríceps: 9.2,
      Subescapular: 13.1,
      Bíceps: 5.8,
      'Cresta ilíaca': 11.4,
      Supraespinal: 12.0,
      Abdominal: 16.5,
      'Muslo medial': 15.2,
      'Pantorrilla medial': 9.8,
      'Brazo relajado': 28.5,
      'Brazo flexionado y en tensión': 32.1,
      Cintura: 78.0,
      'Cadera (glúteo)': 96.5,
      'Pantorrilla máxima': 36.2,
      Biestiloideo: 5.7,
      'Bicondíleo del fémur': 9.1,
    },
  },
  {
    fecha: '2026-02-10T12:00:00',
    notas: `${DEMO_PREFIX} Control intermedio`,
    valores: {
      'Masa corporal': 75.9,
      Estatura: 178,
      Tríceps: 8.6,
      Subescapular: 12.4,
      Bíceps: 5.4,
      'Cresta ilíaca': 10.8,
      Supraespinal: 11.2,
      Abdominal: 15.1,
      'Muslo medial': 14.5,
      'Pantorrilla medial': 9.2,
      'Brazo relajado': 28.8,
      'Brazo flexionado y en tensión': 32.4,
      Cintura: 76.5,
      'Cadera (glúteo)': 96.0,
      'Pantorrilla máxima': 36.5,
      Biestiloideo: 5.7,
      'Bicondíleo del fémur': 9.1,
    },
  },
  {
    fecha: '2026-04-28T12:00:00',
    notas: `${DEMO_PREFIX} Control actual`,
    valores: {
      'Masa corporal': 75.2,
      Estatura: 178,
      Tríceps: 8.0,
      Subescapular: 11.8,
      Bíceps: 5.0,
      'Cresta ilíaca': 10.2,
      Supraespinal: 10.5,
      Abdominal: 14.0,
      'Muslo medial': 13.8,
      'Pantorrilla medial': 8.8,
      'Brazo relajado': 29.0,
      'Brazo flexionado y en tensión': 32.8,
      Cintura: 75.5,
      'Cadera (glúteo)': 95.5,
      'Pantorrilla máxima': 36.8,
      Biestiloideo: 5.8,
      'Bicondíleo del fémur': 9.2,
    },
  },
];

async function cleanupDemoMeasurements(models, atletaId) {
  const { Measurement } = models;
  const deleted = await Measurement.deleteMany({
    atleta: atletaId,
    notasExtra: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
  return deleted.deletedCount || 0;
}

async function seedNutriMetrics(models) {
  const { User, MetricDefinition, Measurement } = models;

  let evaluador = await User.findOne({ rol: 'nutricionista' });
  if (!evaluador) {
    evaluador = await User.findOne({ rol: { $in: ['admin_club', 'administrativo'] } });
  }
  if (!evaluador) {
    throw new Error('No hay nutricionista ni admin en el club. Creá un usuario staff primero.');
  }

  const atleta = await upsertUser(User, {
    nombre: `${DEMO_PREFIX}`,
    apellido: 'Atleta ISAK',
    email: DEMO_ATLETA_EMAIL,
    passwordPlain: DEMO_PASSWORD,
    rol: 'atleta',
    sexo: 'M',
    fechaNacimiento: new Date('2005-06-15'),
    estado: 'activo',
  });

  const { resolve } = await ensureMetricDefs(MetricDefinition, evaluador._id);

  let total = 0;
  for (const session of SESSIONS) {
    for (const preset of ISAK_PRESETS) {
      const valor = session.valores[preset.nombre];
      if (valor == null) continue;
      const def = resolve(preset.nombre, preset.area);
      if (!def) continue;

      const dup = await Measurement.findOne({
        atleta: atleta._id,
        metrica: def._id,
        fechaMedicion: new Date(session.fecha),
      });
      if (dup) continue;

      await Measurement.create({
        atleta: atleta._id,
        metrica: def._id,
        valor,
        evaluador: evaluador._id,
        fechaMedicion: new Date(session.fecha),
        notasExtra: session.notas,
        visibleParaAtleta: true,
        visibleParaTutor: true,
      });
      total += 1;
    }
  }

  return {
    atletaEmail: atleta.email,
    atletaId: String(atleta._id),
    atletaNombre: `${atleta.nombre} ${atleta.apellido}`.trim(),
    evaluadorEmail: evaluador.email,
    medicionesCreadas: total,
    sesiones: SESSIONS.length,
  };
}

async function main() {
  console.log('🌱 Seed nutrición ISAK — inicio');
  const { db, identifier } = await resolveTenantConnection();
  const models = getTenantModels(db);
  console.log(`   Club / tenant: ${identifier}`);

  const existingAtleta = await models.User.findOne({ email: DEMO_ATLETA_EMAIL });
  if (existingAtleta && process.env.SEED_FORCE === 'true') {
    const removed = await cleanupDemoMeasurements(models, existingAtleta._id);
    console.log(`   SEED_FORCE=true → ${removed} mediciones demo eliminadas`);
  }

  const hasDemo =
    existingAtleta &&
    (await models.Measurement.findOne({
      atleta: existingAtleta._id,
      notasExtra: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    }));

  if (hasDemo && process.env.SEED_FORCE !== 'true') {
    console.log('   Ya existen mediciones demo ISAK. Usá SEED_FORCE=true para regenerar.');
    console.log(`   Atleta: ${DEMO_ATLETA_EMAIL} / contraseña: ${DEMO_PASSWORD}`);
    process.exit(0);
  }

  const summary = await seedNutriMetrics(models);
  console.log('✅ Seed nutrición ISAK completado:');
  console.log(`   Atleta: ${summary.atletaNombre}`);
  console.log(`   Email: ${summary.atletaEmail} / contraseña: ${DEMO_PASSWORD}`);
  console.log(`   ID: ${summary.atletaId}`);
  console.log(`   Sexo: M · Nacimiento: 15/06/2005 (~20 años)`);
  console.log(`   Evaluador: ${summary.evaluadorEmail}`);
  console.log(`   Mediciones nuevas: ${summary.medicionesCreadas} (${summary.sesiones} fechas)`);
  console.log('\n   En la app (nutricionista):');
  console.log('   · Registrar → buscá “Demo — Atleta ISAK” (card 1: Masa corporal + Estatura, sin Peso duplicado)');
  console.log('   · Gráfico → % grasa, somatotipo y evolución en 3 controles');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed nutrición ISAK falló:', err.response?.data?.message || err.message);
  process.exit(1);
});
