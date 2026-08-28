import { APP_URL } from '../config';
import BrandLogo from './BrandLogo';
import './Header.css';

const LINKS = [
  { href: '#funciones', label: 'Funciones' },
  { href: '#como-usarla', label: 'Cómo usarla' },
  { href: '#precios', label: 'Precios' },
  { href: '#contacto', label: 'Contacto' },
];

export default function Header() {
  return (
    <header className="header">
      <div className="container header__inner">
        <a href="#" className="header__brand" aria-label="Hermes Club APP">
          <BrandLogo size="md" showText={false} src="/icon.png" />
        </a>
        <nav className="header__nav" aria-label="Principal">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="header__link">
              {link.label}
            </a>
          ))}
        </nav>
        <a href={APP_URL} className="btn btn--primary header__cta">
          Ingresar
        </a>
      </div>
    </header>
  );
}
