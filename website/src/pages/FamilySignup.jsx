import { useEffect, useMemo, useState } from 'react';
import { CLUB_API_URL, SUPER_API_URL, TERMS_URL, PRIVACY_URL, APP_URL } from '../api';
import './FamilySignup.css';

function emptyAthlete() {
  return {
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    fechaNacimiento: '',
    sexo: '',
    dni: '',
    telefono: '',
  };
}

function queryParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    club: (q.get('club') || '').trim().toLowerCase(),
    token: (q.get('token') || '').trim(),
  };
}

async function clubFetch(path, { club, method = 'GET', body } = {}) {
  const res = await fetch(`${CLUB_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-club-identifier': club,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'No se pudo completar la solicitud.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function FamilySignup() {
  const { club, token } = useMemo(() => queryParams(), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState(null);
  const [clubNombre, setClubNombre] = useState(club);
  const [done, setDone] = useState(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [tutor, setTutor] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
  });
  const [atletas, setAtletas] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!club || !token) {
        setError('Falta el código del club o el token de la invitación en el enlace.');
        setLoading(false);
        return;
      }
      try {
        const [preview, publicClub] = await Promise.all([
          clubFetch(`/family-invites/public/${encodeURIComponent(token)}`, { club }),
          fetch(`${SUPER_API_URL}/clubs/public/${encodeURIComponent(club)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        if (publicClub?.nombre) setClubNombre(publicClub.nombre);
        else if (preview.clubNombre) setClubNombre(preview.clubNombre);
        if (preview.expired) {
          setError(
            preview.estado === 'completada'
              ? 'Esta invitación ya fue utilizada.'
              : 'Esta invitación expiró o fue cancelada. Pedile al club un enlace nuevo.',
          );
          setInvite(preview);
          setLoading(false);
          return;
        }
        setInvite(preview);
        setAtletas(preview.athleteSlots.map(() => emptyAthlete()));
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudo cargar la invitación.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [club, token]);

  const updateTutor = (field, value) => setTutor((p) => ({ ...p, [field]: value }));
  const updateAthlete = (index, field, value) => {
    setAtletas((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const requiereTutor = invite?.requiereTutor !== false;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!acceptTerms) {
      setError('Tenés que aceptar los Términos y la Política de privacidad.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await clubFetch(`/family-invites/public/${encodeURIComponent(token)}/redeem`, {
        club,
        method: 'POST',
        body: {
          ...(requiereTutor ? { tutor } : {}),
          atletas,
          acceptTerms: true,
        },
      });
      setDone(data);
    } catch (err) {
      setError(err.message || 'No se pudo completar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fs-page">
        <div className="fs-card fs-card--center">
          <p className="fs-muted">Cargando invitación…</p>
        </div>
      </div>
    );
  }

  if (done) {
    const withTutor = Boolean(done.tutor);
    return (
      <div className="fs-page">
        <div className="fs-card">
          <p className="fs-eyebrow">Listo</p>
          <h1 className="fs-title">{withTutor ? 'Familia registrada' : 'Registro listo'}</h1>
          <p className="fs-lead">
            Ya {withTutor ? 'pueden' : 'podés'} entrar a la app con el código <strong>{club}</strong> y
            el email/contraseña que cargaron.
          </p>
          <ul className="fs-summary">
            {done.tutor ? (
              <li>
                Tutor: {done.tutor.nombre} {done.tutor.apellido} ({done.tutor.email})
              </li>
            ) : null}
            {(done.atletas || []).map((a) => (
              <li key={a._id}>
                Atleta: {a.nombre} {a.apellido} ({a.email})
              </li>
            ))}
          </ul>
          <a className="fs-btn" href={APP_URL} target="_blank" rel="noreferrer">
            Abrir la app
          </a>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="fs-page">
        <div className="fs-card">
          <h1 className="fs-title">Enlace no válido</h1>
          <p className="fs-error">{error}</p>
        </div>
      </div>
    );
  }

  const athleteCount = invite?.athleteSlots?.length || 0;

  return (
    <div className="fs-page">
      <form className="fs-card" onSubmit={onSubmit}>
        <p className="fs-eyebrow">{requiereTutor ? 'Alta de familia' : 'Alta de atleta'}</p>
        <h1 className="fs-title">{clubNombre || club}</h1>
        <p className="fs-lead">
          {requiereTutor
            ? `Completá tus datos y los de ${athleteCount} atleta${athleteCount === 1 ? '' : 's'}. Las categorías ya las eligió el club.`
            : `Completá tus datos para registrarte. La categoría ya la eligió el club.`}
        </p>

        {error ? <p className="fs-error">{error}</p> : null}

        {requiereTutor ? (
          <section className="fs-section">
            <h2 className="fs-section-title">Tutor / responsable</h2>
            <div className="fs-grid">
              <label className="fs-field">
                <span>Nombre</span>
                <input required value={tutor.nombre} onChange={(e) => updateTutor('nombre', e.target.value)} />
              </label>
              <label className="fs-field">
                <span>Apellido</span>
                <input required value={tutor.apellido} onChange={(e) => updateTutor('apellido', e.target.value)} />
              </label>
              <label className="fs-field">
                <span>Email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={tutor.email}
                  onChange={(e) => updateTutor('email', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Contraseña</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={tutor.password}
                  onChange={(e) => updateTutor('password', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Teléfono (opcional)</span>
                <input value={tutor.telefono} onChange={(e) => updateTutor('telefono', e.target.value)} />
              </label>
              <label className="fs-field">
                <span>DNI (opcional)</span>
                <input value={tutor.dni} onChange={(e) => updateTutor('dni', e.target.value)} />
              </label>
            </div>
          </section>
        ) : null}

        {(invite?.athleteSlots || []).map((slot, index) => (
          <section className="fs-section" key={slot.slotId || index}>
            <h2 className="fs-section-title">
              {requiereTutor
                ? `Atleta ${index + 1}`
                : athleteCount > 1
                  ? `Atleta ${index + 1}`
                  : 'Tus datos'}
            </h2>
            <p className="fs-slot-meta">
              {slot.disciplina?.nombre || 'Disciplina'} · {slot.categoria?.nombre || 'Categoría'}
              {slot.categoria?.edadMinima || slot.categoria?.edadMaxima
                ? ` · ${slot.categoria.edadMinima ?? '?'}–${slot.categoria.edadMaxima ?? '?'} años`
                : ''}
            </p>
            <div className="fs-grid">
              <label className="fs-field">
                <span>Nombre</span>
                <input
                  required
                  value={atletas[index]?.nombre || ''}
                  onChange={(e) => updateAthlete(index, 'nombre', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Apellido</span>
                <input
                  required
                  value={atletas[index]?.apellido || ''}
                  onChange={(e) => updateAthlete(index, 'apellido', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Email</span>
                <input
                  required
                  type="email"
                  value={atletas[index]?.email || ''}
                  onChange={(e) => updateAthlete(index, 'email', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Contraseña</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={atletas[index]?.password || ''}
                  onChange={(e) => updateAthlete(index, 'password', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Fecha de nacimiento</span>
                <input
                  required
                  type="date"
                  value={atletas[index]?.fechaNacimiento || ''}
                  onChange={(e) => updateAthlete(index, 'fechaNacimiento', e.target.value)}
                />
              </label>
              <label className="fs-field">
                <span>Sexo</span>
                <select
                  value={atletas[index]?.sexo || ''}
                  onChange={(e) => updateAthlete(index, 'sexo', e.target.value)}
                  required={slot.categoria?.sexo === 'M' || slot.categoria?.sexo === 'F'}
                >
                  <option value="">Preferible</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </label>
              <label className="fs-field">
                <span>DNI (opcional)</span>
                <input
                  value={atletas[index]?.dni || ''}
                  onChange={(e) => updateAthlete(index, 'dni', e.target.value)}
                />
              </label>
            </div>
          </section>
        ))}

        <label className="fs-terms">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
          <span>
            Acepto los{' '}
            <a href={TERMS_URL} target="_blank" rel="noreferrer">
              Términos
            </a>{' '}
            y la{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Política de privacidad
            </a>
            .
          </span>
        </label>

        <button className="fs-btn" type="submit" disabled={submitting || invite?.expired}>
          {submitting ? 'Registrando…' : requiereTutor ? 'Registrar familia' : 'Completar registro'}
        </button>
      </form>
    </div>
  );
}
