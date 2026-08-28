import { ANDROID_STORE_URL, IOS_STORE_URL } from '../config';
import './StoreBadges.css';

export default function StoreBadges({ className = '', variant = 'default' }) {
  return (
    <div className={`store-badges store-badges--${variant} ${className}`.trim()}>
      <a
        className="store-badge store-badge--ios"
        href={IOS_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="/badges/app-store.svg"
          alt="Descargar en el App Store"
          height={40}
          width={120}
        />
      </a>
      <a
        className="store-badge store-badge--android"
        href={ANDROID_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="/badges/google-play.png"
          alt="Disponible en Google Play"
          height={40}
          width={135}
        />
      </a>
    </div>
  );
}
