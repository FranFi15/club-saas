import { useEffect, useState } from 'react';
import { TUTORIALS } from '../config';
import './Tutorials.css';

const SCENE_MS = 3400;

function SceneDownload() {
  return (
    <div className="demo-scene demo-scene--center">
      <div className="demo-logo">H</div>
      <p className="demo-appname">Hermes Club App</p>
      <p className="demo-caption">Instalá la app en tu celular</p>
      <div className="demo-pills">
        <span>App Store</span>
        <span>Google Play</span>
      </div>
    </div>
  );
}

function SceneClubCode() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Tu club</p>
      <h3 className="demo-heading">Ingresá el código</h3>
      <div className="demo-field demo-field--typing">
        <span className="demo-typed">mi-club</span>
      </div>
      <div className="demo-btn">Ingresar</div>
    </div>
  );
}

function SceneLogin() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Sesión</p>
      <h3 className="demo-heading">Iniciá sesión</h3>
      <div className="demo-field">
        <span>sofia@club.com</span>
      </div>
      <div className="demo-field demo-field--secret">••••••••</div>
      <div className="demo-btn">Entrar</div>
    </div>
  );
}

function SceneFees() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Cuotas</p>
      <h3 className="demo-heading">Agosto 2026</h3>
      <div className="demo-card demo-card--warn">
        <div>
          <strong>Cuota mensual</strong>
          <span>Pendiente</span>
        </div>
        <em>$18.500</em>
      </div>
      <div className="demo-card">
        <div>
          <strong>Julio 2026</strong>
          <span>Pagada</span>
        </div>
        <em>$18.500</em>
      </div>
    </div>
  );
}

function ScenePay() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Pago</p>
      <h3 className="demo-heading">Confirmar cuota</h3>
      <div className="demo-total">
        <span>Total a pagar</span>
        <strong>$18.500</strong>
      </div>
      <div className="demo-btn">Pagar con Mercado Pago</div>
      <p className="demo-hint">O cargá el comprobante de transferencia</p>
    </div>
  );
}

function SceneQr() {
  return (
    <div className="demo-scene demo-scene--center">
      <p className="demo-kicker">Ingreso</p>
      <h3 className="demo-heading">Tu QR del club</h3>
      <div className="demo-qr" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="demo-caption">Mostralo en la puerta</p>
    </div>
  );
}

function SceneAgenda() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Agenda</p>
      <h3 className="demo-heading">Esta semana</h3>
      <ul className="demo-list">
        <li className="demo-list__item demo-list__item--active">
          <b>Hoy 18:00</b>
          <span>Entrenamiento · Sub-15</span>
        </li>
        <li className="demo-list__item">
          <b>Sáb 10:00</b>
          <span>Partido vs. Norte</span>
        </li>
        <li className="demo-list__item">
          <b>Lun 17:30</b>
          <span>Preparación física</span>
        </li>
      </ul>
    </div>
  );
}

function SceneSession() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Sesión</p>
      <h3 className="demo-heading">Sub-15 · Cancha 2</h3>
      <div className="demo-stat">
        <span>Convocados</span>
        <strong>18</strong>
      </div>
      <p className="demo-caption demo-caption--left">Entrenamiento táctico · 18:00 a 19:30</p>
      <div className="demo-btn">Tomar asistencia</div>
    </div>
  );
}

function SceneAttendance() {
  return (
    <div className="demo-scene">
      <p className="demo-kicker">Asistencia</p>
      <h3 className="demo-heading">Plantel</h3>
      <ul className="demo-list">
        <li className="demo-list__item demo-list__item--check">
          <b>Sofía Álvarez</b>
          <span>Presente</span>
        </li>
        <li className="demo-list__item demo-list__item--check">
          <b>Marco Díaz</b>
          <span>Presente</span>
        </li>
        <li className="demo-list__item">
          <b>Lucía Pérez</b>
          <span>Ausente</span>
        </li>
      </ul>
    </div>
  );
}

const SCENES = {
  empezar: [SceneDownload, SceneClubCode, SceneLogin],
  socio: [SceneFees, ScenePay, SceneQr],
  coach: [SceneAgenda, SceneSession, SceneAttendance],
};

function PhoneWalkthrough({ tutorial, playing, onToggle }) {
  const [scene, setScene] = useState(0);
  const Scene = SCENES[tutorial.id]?.[scene] || SceneDownload;

  useEffect(() => {
    setScene(0);
  }, [tutorial.id]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      setScene((current) => (current + 1) % tutorial.scenes.length);
    }, SCENE_MS);
    return () => window.clearInterval(id);
  }, [playing, tutorial.id, tutorial.scenes.length]);

  return (
    <div className="phone">
      <div className="phone__bezel">
        <div className="phone__status">
          {tutorial.scenes.map((item, index) => (
            <span
              key={item.label}
              className={`phone__tick${index === scene ? ' phone__tick--active' : ''}${index < scene ? ' phone__tick--done' : ''}`}
            >
              <i
                key={`${tutorial.id}-${index}-${scene === index ? 'on' : 'off'}-${playing}`}
                style={
                  index === scene && playing
                    ? { animationDuration: `${SCENE_MS}ms` }
                    : undefined
                }
              />
            </span>
          ))}
        </div>
        <div className="phone__screen" key={`${tutorial.id}-${scene}`}>
          <Scene />
        </div>
        <button
          type="button"
          className="phone__play"
          onClick={onToggle}
          aria-label={playing ? 'Pausar video' : 'Reproducir video'}
        >
          {playing ? 'Pausa' : 'Play'}
        </button>
      </div>
      <p className="phone__caption">{tutorial.scenes[scene]?.caption}</p>
    </div>
  );
}

export default function Tutorials() {
  const [activeId, setActiveId] = useState(TUTORIALS[0].id);
  const [playing, setPlaying] = useState(true);
  const tutorial = TUTORIALS.find((item) => item.id === activeId) || TUTORIALS[0];

  return (
    <section id="como-usarla" className="section section--light tutorials">
      <div className="container tutorials__layout">
        <div className="tutorials__copy">
          <p className="section__eyebrow">Cómo usarla</p>
          <h2 className="section__title">Videos para empezar en minutos</h2>
          <p className="section__lead">
            Tres recorridos cortos: entrar al club, pagar y pasar el QR, o tomar asistencia.
            Elegí el tuyo y seguí los pasos en el celular.
          </p>

          <div className="tutorials__tabs" role="tablist" aria-label="Videos de uso">
            {TUTORIALS.map((item) => {
              const selected = item.id === tutorial.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`tutorials__tab${selected ? ' tutorials__tab--active' : ''}`}
                  onClick={() => {
                    setActiveId(item.id);
                    setPlaying(true);
                  }}
                >
                  <span className="tutorials__tab-audience">{item.audience}</span>
                  <span className="tutorials__tab-title">{item.title}</span>
                </button>
              );
            })}
          </div>

          <p className="tutorials__summary">{tutorial.summary}</p>
          <ol className="tutorials__steps">
            {tutorial.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <PhoneWalkthrough
          tutorial={tutorial}
          playing={playing}
          onToggle={() => setPlaying((value) => !value)}
        />
      </div>
    </section>
  );
}
