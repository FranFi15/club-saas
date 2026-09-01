import { useState } from 'react';
import rolesData from '../data/rolesInterfaces.json';
import './RolesGuide.css';

function InterfaceScreen({ role }) {
  const image = role.image;

  return (
    <div className="guide-mockup">
      <div className="guide-mockup__bezel">
        <div className="guide-mockup__screen">
          {image ? (
            <img
              className="guide-mockup__image"
              src={image}
              alt={`Interfaz de ${role.name}`}
              loading="lazy"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function RolesGuide() {
  const roles = rolesData.roles;
  const [activeCode, setActiveCode] = useState(roles[0]?.code ?? '');
  const role = roles.find((item) => item.code === activeCode) ?? roles[0];

  return (
    <section id="como-usarla" className="section section--light roles-guide">
      <div className="container">
        <p className="section__eyebrow">Cómo usarla</p>
        <h2 className="section__title">Cada rol ve su propia interfaz</h2>
        <p className="section__lead roles-guide__about">{rolesData.about}</p>
        <p className="roles-guide__intro">{rolesData.intro}</p>

        <div className="roles-guide__layout">
          <div className="roles-guide__sidebar">
            <p className="roles-guide__sidebar-title">Roles</p>
            <div className="roles-guide__picker" role="tablist" aria-label="Roles de la app">
              {roles.map((item) => {
                const selected = item.code === role?.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`roles-guide__tab${selected ? ' roles-guide__tab--active' : ''}`}
                    onClick={() => setActiveCode(item.code)}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>

            <a className="roles-guide__pdf" href={rolesData.pdfPath} download>
              Descargar guía completa en PDF
            </a>
          </div>

          {role ? (
            <div className="roles-guide__panel" key={role.code}>
              <div className="roles-guide__copy">
                <h3 className="roles-guide__role-title">{role.name}</h3>
                <p className="roles-guide__summary">{role.summary}</p>
                <ul className="roles-guide__list">
                  {role.can.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <InterfaceScreen key={role.code} role={role} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
