import { APP_URL, APP_NAME, DEMO_TRIAL_TEXT } from '../config';
import BrandLogo from './BrandLogo';
import StoreBadges from './StoreBadges';
import './Hero.css';

export default function Hero() {
  return (
    <section id="app" className="hero">
      <div className="container hero__inner">
        <div className="hero__brand">
          <BrandLogo size="hero" showText={false} className="hero__logo" />
        </div>
        <div className="hero__copy">
          <h1 className="hero__title">
            Todo tu club en una sola app
          </h1>
          <p className="hero__lead">{DEMO_TRIAL_TEXT}</p>
          <StoreBadges className="hero__stores" variant="hero" />
          <div className="hero__actions">
            <a href={APP_URL} className="btn btn--outline hero__btn-secondary">
              Abrir {APP_NAME} en el navegador
            </a>
            <a href="#como-usarla" className="btn btn--outline hero__btn-secondary">
              Ver cómo usarla
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
