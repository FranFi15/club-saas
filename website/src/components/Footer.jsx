import { APP_NAME } from '../config';
import BrandLogo from './BrandLogo';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <a href="#" className="footer__brand" aria-label="Hermes Club APP">
          <BrandLogo size="lg" showText={false} src="/icon.png" className="footer__logo" />
        </a>
        <p className="footer__copy">© {year} {APP_NAME}. Todos los derechos reservados.</p>
        <a href="/privacidad/" className="footer__privacy">Política de privacidad</a>
      </div>
    </footer>
  );
}
