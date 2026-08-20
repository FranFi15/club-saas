import { useMemo, useState } from 'react';
import { PRICING, calculateMonthlyPrice, formatArs } from '../config';
import './Pricing.css';

const DEFAULT_ATHLETES = 120;
const SLIDER_MAX = 4000;

function tierRangeLabel(tier, index, tiers) {
  if (index === 0) return `1 – ${tier.upTo.toLocaleString('es-AR')}`;
  const prev = tiers[index - 1].upTo;
  if (tier.upTo === Infinity) return `${(prev + 1).toLocaleString('es-AR')}+`;
  return `${(prev + 1).toLocaleString('es-AR')} – ${tier.upTo.toLocaleString('es-AR')}`;
}

export default function Pricing() {
  const [athletes, setAthletes] = useState(DEFAULT_ATHLETES);
  const quote = useMemo(() => calculateMonthlyPrice(athletes), [athletes]);

  const onInputChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const next = raw === '' ? 0 : Math.min(Number(raw), 99_999);
    setAthletes(next);
  };

  return (
    <section id="precios" className="section section--light pricing">
      <div className="container">
        <p className="section__eyebrow">Precios</p>
        <h2 className="section__title">Calculá el abono de tu club</h2>
        <p className="section__lead">
          Elegí el tramo según la cantidad de atletas: todos se cobran a esa tarifa. Ingresá cuántos
          tenés y ves el total mensual al instante.
        </p>

        <div className="pricing__rates" role="list" aria-label="Tarifas por tramo">
          {PRICING.tiers.map((tier, index) => {
            const active = quote.tier?.upTo === tier.upTo;
            return (
              <div
                key={tier.label}
                className={`pricing__rate${active ? ' pricing__rate--active' : ''}`}
                role="listitem"
              >
                <p className="pricing__rate-range">{tierRangeLabel(tier, index, PRICING.tiers)}</p>
                <p className="pricing__rate-value">
                  {formatArs(tier.rate)}
                  <span> / atleta</span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="pricing__calc">
          <label className="pricing__label" htmlFor="athlete-count">
            ¿Cuántos atletas activos tiene tu club?
          </label>
          <div className="pricing__controls">
            <input
              id="athlete-count"
              className="pricing__number"
              type="text"
              inputMode="numeric"
              value={athletes === 0 ? '' : String(athletes)}
              placeholder="0"
              onChange={onInputChange}
              aria-describedby="pricing-hint"
            />
            <input
              className="pricing__slider"
              type="range"
              min={0}
              max={SLIDER_MAX}
              step={10}
              value={Math.min(athletes, SLIDER_MAX)}
              onChange={(e) => setAthletes(Number(e.target.value))}
              aria-label="Deslizá para estimar atletas"
            />
          </div>
          <p id="pricing-hint" className="pricing__hint">
            Se cobran solo atletas activos. Tutores y staff no suman al abono.
            {PRICING.minimumMonthly > 0
              ? ` Mínimo mensual: ${formatArs(PRICING.minimumMonthly)}.`
              : null}
          </p>

          <div className="pricing__result" aria-live="polite">
            <div className="pricing__total-block">
              <p className="pricing__total-label">Abono mensual estimado</p>
              <p className="pricing__total">{formatArs(quote.total)}</p>
              {quote.athletes > 0 ? (
                <p className="pricing__avg">
                  {quote.athletes.toLocaleString('es-AR')} atletas × {formatArs(quote.rate)}
                  {quote.appliedMinimum ? ' · se aplica el mínimo' : ''}
                </p>
              ) : (
                <p className="pricing__avg">Ingresá una cantidad para ver el total</p>
              )}
            </div>

            {quote.breakdown.length > 0 ? (
              <ul className="pricing__breakdown">
                {quote.breakdown.map((row) => (
                  <li key={row.label}>
                    <span>
                      {row.count.toLocaleString('es-AR')} atletas × {formatArs(row.rate)}
                      <em> · {row.label}</em>
                    </span>
                    <strong>{formatArs(row.amount)}</strong>
                  </li>
                ))}
                {quote.appliedMinimum ? (
                  <li className="pricing__breakdown-min">
                    <span>Ajuste a mínimo mensual</span>
                    <strong>{formatArs(quote.total)}</strong>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          <div className="pricing__actions">
            <a
              href="https://wa.me/5492915279308?text=Hola%2C%20quiero%20consultar%20por%20Hermes%20Club%20App"
              className="btn btn--primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Quiero este plan
            </a>
            <a href="#contacto" className="btn btn--outline">
              Más info
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
