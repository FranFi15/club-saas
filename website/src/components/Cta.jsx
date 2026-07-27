import { APP_URL, DEMO_TRIAL_BADGE, DEMO_TRIAL_TEXT } from '../config';
import './Cta.css';

export default function Cta() {
  return (
    <section id="contacto" className="cta section">
      <div className="container">
        <div className="cta__card">
          <div className="cta__glow" aria-hidden />
          <p className="cta__badge">{DEMO_TRIAL_BADGE}</p>
          <h2 className="cta__title">Empezá a usar Hermes</h2>
          <p className="cta__text">
            {DEMO_TRIAL_TEXT} Ingresá con el identificador de tu club e iniciá sesión.
          </p>
          <div className="cta__actions">
            <a href={APP_URL} className="btn btn--primary">
              Ir a la aplicación
            </a>
            <a
              href="https://wa.me/5492915279308"
              className="btn btn--outline cta__outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultanos
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
