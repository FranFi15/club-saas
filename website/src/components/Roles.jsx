import { ROLES } from '../config';
import './Roles.css';

export default function Roles() {
  return (
    <section id="roles" className="section">
      <div className="container roles">
        <div className="roles__intro">
          <p className="section__eyebrow">Para quién</p>
          <h2 className="section__title">Una app, todos los perfiles</h2>
          <p className="section__lead">
            Cada persona ve solo lo que necesita: administradores, entrenadores, atletas,
            tutores y staff especializado trabajan sobre la misma base de datos del club.
          </p>
        </div>
        <ul className="roles__list">
          {ROLES.map((role, index) => (
            <li key={role.label} className="roles__item">
              <span className="roles__index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="roles__label">{role.label}</h3>
                <p className="roles__detail">{role.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
