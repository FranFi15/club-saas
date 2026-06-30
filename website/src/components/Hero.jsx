import { APP_URL, APP_NAME } from '../config';
import BrandLogo from './BrandLogo';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__brand">
          <BrandLogo size="hero" showText={false} className="hero__logo" />
        </div>
        <div className="hero__copy">
          <h1 className="hero__title">
            Todo tu club en una sola app
          </h1>
          <div className="hero__actions">
            <a href={APP_URL} className="btn btn--primary">
              Abrir {APP_NAME}
            </a>
            <a href="#funciones" className="btn btn--outline hero__btn-secondary">
              Ver funciones
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
