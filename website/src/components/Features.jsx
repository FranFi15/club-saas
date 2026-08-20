import { useState } from 'react';
import { FEATURES, APP_NAME } from '../config';
import FeatureIcon from './FeatureIcon';
import './Features.css';

const ACCENT_COLORS = ['#18549a', '#2d6fb5', '#3d7ec4', '#134178', '#0d2f5c', '#2160ad'];

export default function Features() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section id="funciones" className="section section--light">
      <div className="container">
      <p className="section__eyebrow">Funciones</p>
        <h2 className="section__title">Lo que tu club puede hacer hoy</h2>
        <p className="section__lead">
          {APP_NAME} reúne en una plataforma multi-rol el día a día de tu institución:
          desde la mesa de administración hasta el atleta que consulta su agenda en el bolsillo.
        </p>
        <div className="features-accordion" role="tablist" aria-label="Funciones de la app">
          {FEATURES.map((feature, index) => {
            const isActive = activeIndex === index;

            return (
              <button
                key={feature.title}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`feature-panel-${index}`}
                id={`feature-tab-${index}`}
                className={`features-accordion__option${isActive ? ' active' : ''}`}
                style={{
                  '--optionAccent': ACCENT_COLORS[index % ACCENT_COLORS.length],
                  '--optionImage': `url("${feature.image}")`,
                }}
                onClick={() => setActiveIndex(index)}
              >
                <div className="features-accordion__label">
                  <div className="features-accordion__icon">
                    <FeatureIcon name={feature.icon} variant="accordion" />
                  </div>
                  <div
                    className="features-accordion__info"
                    id={`feature-panel-${index}`}
                    role="tabpanel"
                    aria-labelledby={`feature-tab-${index}`}
                  >
                    <div className="features-accordion__main">{feature.title}</div>
                    <div className="features-accordion__sub">{feature.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
