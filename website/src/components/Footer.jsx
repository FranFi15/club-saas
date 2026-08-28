import { APP_NAME } from '../config';
import BrandLogo from './BrandLogo';
import StoreBadges from './StoreBadges';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <a href="#" className="footer__brand" aria-label="Hermes Club APP">
          <BrandLogo size="lg" showText={false} src="/icon.png" className="footer__logo" />
        </a>
        <StoreBadges variant="footer" className="footer__stores" />
        <p className="footer__copy">© {year} {APP_NAME}. Todos los derechos reservados.</p>
        <div className="footer__links">
          <a href="/privacidad/" className="footer__privacy">Política de privacidad</a>
          <a href="/terminos/" className="footer__privacy">Términos y condiciones</a>
        </div>
      </div>
    </footer>
  );
}
