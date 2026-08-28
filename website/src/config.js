export const APP_NAME = 'Hermes Club App';
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://app.hermesclubapp.com';
export const IOS_STORE_URL =
  import.meta.env.VITE_IOS_STORE_URL ||
  'https://apps.apple.com/ar/app/hermes-club-app/id6788793406';
export const ANDROID_STORE_URL =
  import.meta.env.VITE_ANDROID_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.hermesclubapp.app';
export const DEMO_TRIAL_BADGE = '1 mes de prueba gratis';
export const DEMO_TRIAL_TEXT =
  'Probá la app con tu club durante 30 días. Sin compromiso, para conocer todas las funciones antes de decidir.';

export const FEATURES = [
  {
    title: 'Finanzas y cuotas',
    description: 'Planes, cobranzas, familias con descuento, comprobantes y Mercado Pago integrado.',
    icon: 'payments',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Plantel y categorías',
    description: 'Disciplinas, edades, inscripciones y delegación del armado de plantel al cuerpo técnico.',
    icon: 'team',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Entrenamientos y agenda',
    description: 'Grilla semanal, sesiones, asistencia, alquiler de espacios y reservas externas.',
    icon: 'calendar',
    image: 'https://www.lanacion.com.ar/resizer/v2/muchas-personas-prefieren-utilizar-un-calendario-AW3TWR43FFBGPN34XQATTZ6EDQ.jpg?auth=1aef2f95366bbbc69b13f7873dc2d1d659198be97c01c7ed335d691739a822a5&width=780&height=520&quality=70&smart=true',
  },
  {
    title: 'Comunicación',
    description: 'Noticias del club, notificaciones y recursos para atletas, tutores y staff.',
    icon: 'news',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Documentación',
    description: 'Pedí archivos, revisá entregas y llevá el estado de cada atleta al día.',
    icon: 'docs',
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Control de ingreso',
    description: 'QR de acceso para socios, registro de entradas y operación en puerta.',
    icon: 'qr',
    image: 'https://www.clikisalud.net/wp-content/uploads/2016/08/tel%C3%A9fonos-celulares-cercania-personas.jpg',
  },
];

export const ROLES = [
  { label: 'Administración', detail: 'Estructura, usuarios, finanzas y operación del club.' },
  { label: 'Cuerpo técnico', detail: 'Plantel, sesiones, asistencia y comunicación con el equipo.' },
  { label: 'Atletas y tutores', detail: 'Agenda, cuotas, documentos y novedades en el celular.' },
  { label: 'Staff especializado', detail: 'Nutrición, psicología, wellness y seguimiento individual.' },
];

/** Precio por atleta activo (ARS). Toda la cantidad se cobra a la tarifa del tramo alcanzado. */
export const PRICING = {
  currency: 'ARS',
  /** Monto mínimo mensual (0 = sin mínimo). */
  minimumMonthly: 0,
  tiers: [
    { upTo: 500, rate: 400, label: 'Hasta 500 atletas' },
    { upTo: 1000, rate: 350, label: 'De 501 a 1.000' },
    { upTo: Infinity, rate: 300, label: 'Más de 1.000' },
  ],
};

/**
 * Calcula el abono mensual: atletas × tarifa del tramo correspondiente.
 * @param {number} athletes
 */
export function calculateMonthlyPrice(athletes) {
  const n = Math.max(0, Math.floor(Number(athletes) || 0));
  const { tiers, minimumMonthly, currency } = PRICING;

  const tier = n === 0 ? null : tiers.find((t) => n <= t.upTo) || tiers[tiers.length - 1];
  const rate = tier?.rate ?? 0;
  const subtotal = n * rate;
  const appliedMinimum = Boolean(minimumMonthly && subtotal > 0 && subtotal < minimumMonthly);
  const total = n === 0 ? 0 : appliedMinimum ? minimumMonthly : subtotal;

  return {
    athletes: n,
    currency,
    tier,
    rate,
    breakdown:
      n > 0 && tier
        ? [
            {
              count: n,
              rate,
              amount: subtotal,
              label: tier.label,
            },
          ]
        : [],
    subtotal,
    minimumMonthly,
    appliedMinimum,
    total,
    avgPerAthlete: rate,
  };
}

export const TUTORIALS = [
  {
    id: 'empezar',
    title: 'Cómo entrar a tu club',
    audience: 'Todos',
    summary: 'Descargá la app, escribí el código del club e iniciá sesión con tu usuario.',
    steps: [
      'Descargá Hermes Club App desde App Store o Google Play.',
      'Abrí la app e ingresá el código que te dio el club.',
      'Iniciá sesión con el email y la contraseña que te asignaron.',
    ],
    scenes: [
      { label: 'Descargar', caption: 'Instalá la app en tu celular' },
      { label: 'Código', caption: 'Ingresá el código de tu club' },
      { label: 'Sesión', caption: 'Entrá con email y contraseña' },
    ],
  },
  {
    id: 'socio',
    title: 'Cuotas, pagos y acceso',
    audience: 'Socios y tutores',
    summary: 'Mirá el estado de tus cuotas, pagá desde el celular y mostrá el QR en la puerta.',
    steps: [
      'Entrá a Cuotas para ver qué está pendiente y qué ya pagaste.',
      'Pagá con Mercado Pago o cargá el comprobante de transferencia.',
      'Mostrá tu QR de ingreso en la puerta del club.',
    ],
    scenes: [
      { label: 'Cuotas', caption: 'Revisá pagos pendientes' },
      { label: 'Pagar', caption: 'Confirmá el cobro en un toque' },
      { label: 'QR', caption: 'Ingresá al club con tu código' },
    ],
  },
  {
    id: 'coach',
    title: 'Agenda y asistencia',
    audience: 'Cuerpo técnico',
    summary: 'Abrí la grilla de la semana, entrá a una sesión y tomá asistencia del plantel.',
    steps: [
      'Abrí la agenda para ver entrenamientos y partidos de la semana.',
      'Entrá a la sesión y revisá el plantel convocado.',
      'Marcá presente o ausente: el club queda actualizado al instante.',
    ],
    scenes: [
      { label: 'Agenda', caption: 'Mirá la grilla de la semana' },
      { label: 'Sesión', caption: 'Abrí el entrenamiento del día' },
      { label: 'Asistencia', caption: 'Tomá presente en el plantel' },
    ],
  },
];

export function formatArs(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
