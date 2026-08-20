export const APP_NAME = 'Hermes Club App';
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://app.hermesclubapp.com';
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

/** Precio por atleta activo (ARS). Tramos marginales: cada rango se cobra a su tarifa. */
export const PRICING = {
  currency: 'ARS',
  /** Monto mínimo mensual (0 = sin mínimo). */
  minimumMonthly: 0,
  tiers: [
    { upTo: 500, rate: 550, label: 'Hasta 500 atletas' },
    { upTo: 1000, rate: 450, label: 'De 501 a 1.000' },
    { upTo: 2000, rate: 400, label: 'De 1.001 a 2.000' },
    { upTo: 3000, rate: 350, label: 'De 2.001 a 3.000' },
    { upTo: Infinity, rate: 300, label: 'Más de 3.000' },
  ],
};

/**
 * Calcula el abono mensual con tarifas marginales.
 * @param {number} athletes
 */
export function calculateMonthlyPrice(athletes) {
  const n = Math.max(0, Math.floor(Number(athletes) || 0));
  const { tiers, minimumMonthly, currency } = PRICING;
  const breakdown = [];
  let remaining = n;
  let prevCap = 0;
  let subtotal = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const span = tier.upTo === Infinity ? remaining : Math.max(0, tier.upTo - prevCap);
    const count = Math.min(remaining, span);
    if (count > 0) {
      const amount = count * tier.rate;
      breakdown.push({
        from: prevCap + 1,
        to: prevCap + count,
        count,
        rate: tier.rate,
        amount,
        label: tier.label,
      });
      subtotal += amount;
      remaining -= count;
    }
    prevCap = tier.upTo === Infinity ? prevCap + count : tier.upTo;
  }

  const appliedMinimum = Boolean(minimumMonthly && subtotal > 0 && subtotal < minimumMonthly);
  const total = n === 0 ? 0 : appliedMinimum ? minimumMonthly : subtotal;
  const avgPerAthlete = n > 0 ? Math.round(total / n) : 0;

  return {
    athletes: n,
    currency,
    breakdown,
    subtotal,
    minimumMonthly,
    appliedMinimum,
    total,
    avgPerAthlete,
  };
}

export function formatArs(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
