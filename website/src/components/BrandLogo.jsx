import './BrandLogo.css';

export default function BrandLogo({ className = '', size = 'md', showText = true, src = '/logo.png', alt = 'Hermes Club APP' }) {
  return (
    <span className={`brand-logo brand-logo--${size} ${className}`.trim()}>
      <img src={src} alt={showText ? '' : alt} className="brand-logo__img" width={160} height={160} />
      {showText ? (
        <span className="brand-logo__text">
          <span className="brand-logo__name">Hermes</span>
          <span className="brand-logo__tag">Club App</span>
        </span>
      ) : null}
    </span>
  );
}
