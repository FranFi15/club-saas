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

/** Precio por atleta activo (ARS). Toda la cantidad se cobra a la tarifa del tramo alcanzado. */
export const PRICING = {
  currency: 'ARS',
  /** Monto mínimo mensual (0 = sin mínimo). */
  minimumMonthly: 0,
  tiers: [
    { upTo: 500, rate: 450, label: 'Hasta 500 atletas' },
    { upTo: 1000, rate: 400, label: 'De 501 a 1.000' },
    { upTo: 2000, rate: 350, label: 'De 1.001 a 2.000' },
    { upTo: Infinity, rate: 300, label: 'Más de 2.000' },
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

export function formatArs(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
