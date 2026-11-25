import { useEffect, useMemo, useRef, useState } from 'react';
import { CLUB_API_URL, SUPER_API_URL, TERMS_URL, PRIVACY_URL, APP_URL } from '../api';
import DniImageCropModal, { DNI_ASPECT } from '../components/DniImageCropModal';
import './FamilySignup.css';

function queryParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    club: (q.get('club') || '').trim().toLowerCase(),
    status: (q.get('status') || '').trim().toLowerCase(),
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

async function uploadSocioPhoto({ club, file }) {
  const form = new FormData();
  form.append('archivo', file, file.name || `dni-${Date.now()}.jpg`);
  const res = await fetch(`${CLUB_API_URL}/socio-alta/public/photo`, {
    method: 'POST',
    headers: { 'x-club-identifier': club },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'No se pudo subir la foto.');
  }
  return data.url || data.secureUrl;
}

function DniPhotoField({ label, value, club, onChange, cropTitle }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [cropUrl, setCropUrl] = useState(null);

  const clearCropUrl = () => {
    setCropUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const onFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/') && !/\.(jpe?g|png|gif|webp|hei[cf])$/i.test(file.name || '')) {
      setLocalError('Elegí una imagen.');
      return;
    }
    setLocalError('');
    clearCropUrl();
    setCropUrl(URL.createObjectURL(file));
  };

  const onCropConfirm = async (croppedFile) => {
    clearCropUrl();
    setUploading(true);
    try {
      const url = await uploadSocioPhoto({ club, file: croppedFile });
      onChange(url);
    } catch (e) {
      setLocalError(e.message || 'Error al subir.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fs-photo">
      <span className="fs-photo-label">{label}</span>
      <div className="fs-photo-row">
        <div className="fs-photo-avatar" aria-hidden style={{ borderRadius: 8 }}>
          {value ? <img src={value} alt="" /> : <span>DNI</span>}
        </div>
        <div className="fs-photo-actions">
          <button
            type="button"
            className="fs-photo-btn"
            disabled={uploading || !club}
            onClick={() => cameraRef.current?.click()}
          >
            {uploading ? 'Subiendo…' : 'Tomar foto'}
          </button>
          <button
            type="button"
            className="fs-photo-btn fs-photo-btn--secondary"
            disabled={uploading || !club}
            onClick={() => galleryRef.current?.click()}
          >
            Galería
          </button>
          {value ? (
            <button
              type="button"
              className="fs-photo-clear"
              disabled={uploading}
              onClick={() => onChange('')}
            >
              Quitar
            </button>
          ) : null}
        </div>
      </div>
      {localError ? <p className="fs-error fs-error--inline">{localError}</p> : null}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="fs-file-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onFile(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="fs-file-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onFile(file);
        }}
      />
      <DniImageCropModal
        open={!!cropUrl}
        imageUrl={cropUrl}
        aspect={DNI_ASPECT}
        title={cropTitle || 'Ajustá el DNI'}
        onCancel={clearCropUrl}
        onConfirm={onCropConfirm}
      />
    </div>
  );
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SocioSignup() {
  const { club, status } = useMemo(() => queryParams(), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [clubNombre, setClubNombre] = useState(club);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    dni: '',
    telefono: '',
    direccion: '',
    fechaNacimiento: '',
    sexo: '',
    dniFotoFrente: '',
    dniFotoDorso: '',
  });

  const paidReturn = status === 'ok' || status === 'pendiente';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!club) {
        setError('Falta el código del club en el enlace (?club=…).');
        setLoading(false);
        return;
      }
      try {
        const [cfg, publicClub] = await Promise.all([
          clubFetch('/socio-alta/public/config', { club }),
          fetch(`${SUPER_API_URL}/clubs/public/${encodeURIComponent(club)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        if (publicClub?.nombre) setClubNombre(publicClub.nombre);
        else if (cfg?.club?.nombre) setClubNombre(cfg.club.nombre);
        setConfig(cfg);
        if (!cfg.canSignup && cfg.message) {
          setError(cfg.message);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudo cargar el alta de socio.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [club]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!acceptTerms) {
      setError('Tenés que aceptar los Términos y la Política de privacidad.');
      return;
    }
    const blank = (v) => !String(v || '').trim();
    if (
      blank(form.nombre) ||
      blank(form.apellido) ||
      blank(form.email) ||
      blank(form.dni) ||
      blank(form.dniFotoFrente) ||
      blank(form.dniFotoDorso)
    ) {
      setError('Completá nombre, apellido, email, DNI y las dos fotos del documento.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await clubFetch('/socio-alta/public/submit', {
        club,
        method: 'POST',
        body: {
          ...form,
          dni: String(form.dni).replace(/\D/g, ''),
          fechaNacimiento: form.fechaNacimiento || undefined,
        },
      });
      if (data.linkDePago) {
        window.location.href = data.linkDePago;
        return;
      }
      setError('No se recibió el link de pago. Contactá al club.');
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el alta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fs-page">
        <div className="fs-card fs-card--center">
          <p className="fs-lead">Preparando tu inscripción…</p>
        </div>
      </div>
    );
  }

  if (paidReturn) {
    return (
      <div className="fs-page">
        <div className="fs-card fs-card--center">
          <p className="fs-eyebrow">{clubNombre || club}</p>
          <h1 className="fs-title">
            {status === 'ok' ? '¡Bienvenido al club!' : 'Estamos confirmando tu pago'}
          </h1>
          <p className="fs-lead">
            {status === 'ok'
              ? 'Tu cuota quedó registrada. Te enviamos un email con el usuario y una contraseña temporal para entrar a la app. Si no lo ves, revisá spam o promociones.'
              : 'En cuanto Mercado Pago confirme el pago, activamos tu cuenta de socio y te mandamos el email con el acceso.'}
          </p>
          <p className="fs-lead">
            Para ingresar usá el código del club <strong>{club}</strong>
            {APP_URL ? (
              <>
                {' '}
                en <a href={APP_URL}>{APP_URL}</a>
              </>
            ) : null}
            .
          </p>
        </div>
      </div>
    );
  }

  if (!config?.canSignup) {
    return (
      <div className="fs-page">
        <div className="fs-card fs-card--center">
          <p className="fs-eyebrow">{clubNombre || club}</p>
          <h1 className="fs-title">Inscripción de socios</h1>
          <p className="fs-error">
            {error ||
              'Por ahora no podés inscribirte por acá. Escribile al club para que te indiquen cómo asociarte.'}
          </p>
        </div>
      </div>
    );
  }

  const fee = config.fee;

  return (
    <div className="fs-page">
      <div className="fs-card">
        <p className="fs-eyebrow">Sumate a {clubNombre || 'tu club'}</p>
        <h1 className="fs-title">Bienvenido, hacete socio</h1>
        <p className="fs-lead">
          En unos minutos vas a formar parte de {clubNombre || 'el club'}. Completá tus datos,
          subí fotos claras de tu DNI y pagá la primera cuota social
          {fee ? (
            <>
              {' '}
              (<strong>{fee.nombre}</strong>: ${formatMoney(fee.monto)})
            </>
          ) : null}
          . Al confirmarse el pago te llega un email con tu acceso a la app.
        </p>

        {error ? <p className="fs-error">{error}</p> : null}

        <form onSubmit={onSubmit}>
          <div className="fs-grid">
            <label className="fs-field">
              <span>Nombre *</span>
              <input
                required
                value={form.nombre}
                onChange={(e) => setField('nombre', e.target.value)}
                autoComplete="given-name"
              />
            </label>
            <label className="fs-field">
              <span>Apellido *</span>
              <input
                required
                value={form.apellido}
                onChange={(e) => setField('apellido', e.target.value)}
                autoComplete="family-name"
              />
            </label>
            <label className="fs-field">
              <span>Email *</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value.toLowerCase())}
                autoComplete="email"
              />
            </label>
            <label className="fs-field">
              <span>DNI *</span>
              <input
                required
                inputMode="numeric"
                value={form.dni}
                onChange={(e) => setField('dni', e.target.value.replace(/\D/g, '').slice(0, 9))}
              />
            </label>
            <label className="fs-field">
              <span>Teléfono</span>
              <input
                value={form.telefono}
                onChange={(e) => setField('telefono', e.target.value)}
                autoComplete="tel"
              />
            </label>
            <label className="fs-field">
              <span>Fecha de nacimiento</span>
              <input
                type="date"
                value={form.fechaNacimiento}
                onChange={(e) => setField('fechaNacimiento', e.target.value)}
              />
            </label>
            <label className="fs-field">
              <span>Sexo</span>
              <select value={form.sexo} onChange={(e) => setField('sexo', e.target.value)}>
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </label>
            <label className="fs-field" style={{ gridColumn: '1 / -1' }}>
              <span>Dirección</span>
              <input
                value={form.direccion}
                onChange={(e) => setField('direccion', e.target.value)}
                autoComplete="street-address"
              />
            </label>
          </div>

          <div className="fs-section">
            <h2 className="fs-section-title">Tu DNI</h2>
            <p className="fs-lead" style={{ marginBottom: '0.75rem' }}>
              Necesitamos el frente y el dorso. Encuadrá el documento completo para que coincida con el número que cargaste arriba.
            </p>
            <div className="fs-grid">
              <DniPhotoField
                label="Frente *"
                value={form.dniFotoFrente}
                club={club}
                cropTitle="Ajustá el frente del DNI"
                onChange={(url) => setField('dniFotoFrente', url)}
              />
              <DniPhotoField
                label="Dorso *"
                value={form.dniFotoDorso}
                club={club}
                cropTitle="Ajustá el dorso del DNI"
                onChange={(url) => setField('dniFotoDorso', url)}
              />
            </div>
          </div>

          <label className="fs-terms">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
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

          <button className="fs-btn" type="submit" disabled={submitting}>
            {submitting
              ? 'Validando tu DNI y preparando el pago…'
              : `Asociarme`}
          </button>
        </form>
      </div>
    </div>
  );
}
