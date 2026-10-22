import { useEffect, useMemo, useState } from 'react';
import { CLUB_API_URL, SUPER_API_URL } from '../api';
import './PublicEvents.css';

function queryParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    club: (q.get('club') || '').trim().toLowerCase(),
    e: (q.get('e') || '').trim().toLowerCase(),
    order: (q.get('order') || '').trim(),
    email: (q.get('email') || '').trim().toLowerCase(),
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

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PublicEvents() {
  const params = useMemo(() => queryParams(), []);
  const [clubMeta, setClubMeta] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', dni: '' });
  const [holders, setHolders] = useState([{ nombre: '', apellido: '', dni: '' }]);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!params.club) {
        setError('Falta el club en la URL (?club=…).');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const clubRes = await fetch(`${SUPER_API_URL}/clubs/public/${encodeURIComponent(params.club)}`);
        const clubData = await clubRes.json().catch(() => ({}));
        if (!clubRes.ok) throw new Error(clubData.message || 'Club no encontrado.');
        if (cancelled) return;
        setClubMeta(clubData);

        if (params.order) {
          if (!params.email) {
            setError('Este link de entradas está incompleto.');
            setLoading(false);
            return;
          }
          const orderData = await clubFetch(
            `/events/public/orders/${encodeURIComponent(params.order)}?email=${encodeURIComponent(params.email)}`,
            { club: params.club },
          );
          if (cancelled) return;
          setSuccess(orderData);
          setLoading(false);
          return;
        }

        const list = await clubFetch('/events/public', { club: params.club });
        if (cancelled) return;
        setEvents(list || []);

        if (params.e) {
          const detail = await clubFetch(`/events/public/${encodeURIComponent(params.e)}`, {
            club: params.club,
          });
          if (!cancelled) {
            setSelected(detail);
            const first = (detail.tiposEntrada || [])[0];
            if (first) setTipoId(String(first._id));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error al cargar.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.club, params.e, params.order, params.email]);

  const openEvent = async (ev) => {
    setError('');
    setSuccess(null);
    try {
      const detail = await clubFetch(`/events/public/${encodeURIComponent(ev.slug)}`, {
        club: params.club,
      });
      setSelected(detail);
      const first = (detail.tiposEntrada || [])[0];
      setTipoId(first ? String(first._id) : '');
      setCantidad(1);
      setHolders([{ nombre: '', apellido: '', dni: '' }]);
      setStep(1);
      const url = new URL(window.location.href);
      url.searchParams.set('e', ev.slug);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      setError(e.message);
    }
  };

  const backToList = () => {
    setSelected(null);
    setSuccess(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('e');
    window.history.replaceState({}, '', url.toString());
  };

  const setQty = (value) => {
    const n = Math.max(1, Math.min(20, Number(value) || 1));
    setCantidad(n);
    setHolders((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push({ nombre: '', apellido: '', dni: '' });
      return next;
    });
  };

  const updateHolder = (index, field, value) => {
    setHolders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  };

  const goToHolders = (ev) => {
    ev.preventDefault();
    if (!tipoId) {
      setError('Elegí un tipo de entrada.');
      return;
    }
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) {
      setError('Completá nombre, apellido y email de quien compra.');
      return;
    }
    const qty = Number(cantidad) || 1;
    setHolders((prev) => {
      const next = prev.slice(0, qty);
      while (next.length < qty) next.push({ nombre: '', apellido: '', dni: '' });
      return next;
    });
    setError('');
    setStep(2);
  };

  const copyBuyerToFirst = () => {
    setHolders((prev) => {
      const next = [...prev];
      next[0] = {
        nombre: form.nombre,
        apellido: form.apellido,
        dni: form.dni,
      };
      return next;
    });
  };

  const checkout = async (ev) => {
    ev.preventDefault();
    if (!selected) return;
    const qty = Number(cantidad) || 1;
    const asistentes = holders.slice(0, qty).map((h) => ({
      nombre: h.nombre.trim(),
      apellido: h.apellido.trim(),
      dni: h.dni.replace(/\D/g, ''),
    }));
    const seen = new Set();
    for (let i = 0; i < qty; i += 1) {
      const h = asistentes[i] || { nombre: '', apellido: '', dni: '' };
      if (!h.nombre || !h.apellido || h.dni.length < 6) {
        setError(`Entrada ${i + 1}: completá nombre, apellido y DNI de quien entra.`);
        return;
      }
      if (seen.has(h.dni)) {
        setError(`El DNI ${h.dni} está repetido. Cada entrada es de una persona.`);
        return;
      }
      seen.add(h.dni);
    }
    setSubmitting(true);
    setError('');
    try {
      const data = await clubFetch(`/events/public/${encodeURIComponent(selected.slug)}/checkout`, {
        club: params.club,
        method: 'POST',
        body: {
          tipoEntradaId: tipoId,
          cantidad: qty,
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          email: form.email.trim(),
          dni: form.dni.trim(),
          asistentes,
        },
      });
      if (data.linkDePago) {
        window.location.href = data.linkDePago;
        return;
      }
      setSuccess(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const leaveTickets = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('order');
    url.searchParams.delete('email');
    window.location.assign(url.toString());
  };

  const brand = clubMeta?.primaryColor || '#0f766e';

  const viewingTickets = Boolean(params.order && success);
  const heroUrl = selected?.imagenUrl || (viewingTickets ? success?.evento?.imagenUrl : '');
  const showEvent = Boolean(selected || viewingTickets);

  return (
    <div className={`pe-page${showEvent ? ' pe-page--event' : ''}`} style={{ '--pe-brand': brand }}>
      {heroUrl ? <img className="pe-hero" src={heroUrl} alt="" /> : null}
      <header className="pe-header">
        <div className="pe-brand">
          {clubMeta?.logoUrl ? (
            <img className="pe-logo" src={clubMeta.logoUrl} alt={clubMeta.nombre || 'Club'} />
          ) : (
            <p className="pe-kicker">{clubMeta?.nombre || 'Club'}</p>
          )}
          {!showEvent ? <h1>Eventos</h1> : null}
        </div>
        {showEvent ? (
          <button type="button" className="pe-back" onClick={viewingTickets ? leaveTickets : backToList}>
            ← Todos los eventos
          </button>
        ) : null}
      </header>

      {loading ? <p className="pe-muted">Cargando…</p> : null}
      {error ? <p className="pe-error">{error}</p> : null}

      {!loading && !selected && !success ? (
        <div className="pe-list">
          {(events || []).length === 0 ? (
            <p className="pe-muted">No hay eventos publicados por ahora.</p>
          ) : (
            events.map((ev) => (
              <button
                key={ev._id}
                type="button"
                className="pe-card"
                onClick={() => openEvent(ev)}
              >
                {ev.imagenUrl ? (
                  <img src={ev.imagenUrl} alt="" className="pe-card-img" />
                ) : (
                  <div className="pe-card-img pe-card-img--empty" />
                )}
                <div className="pe-card-body">
                  <h2>{ev.titulo}</h2>
                  <p>{formatWhen(ev.fechaInicio)}</p>
                  {ev.lugar ? <p className="pe-muted">{ev.lugar}</p> : null}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}

      {selected && !success ? (
        <div className="pe-detail">
          <h2>{selected.titulo}</h2>
          <p className="pe-muted">
            {formatWhen(selected.fechaInicio)}
            {selected.lugar ? ` · ${selected.lugar}` : ''}
          </p>
          {selected.descripcion ? <p className="pe-desc">{selected.descripcion}</p> : null}

          <ol className="pe-steps">
            <li className={step === 1 ? 'is-on' : 'is-done'}>1. Compra</li>
            <li className={step === 2 ? 'is-on' : ''}>2. Entradas</li>
          </ol>

          {step === 1 ? (
            <form className="pe-form" onSubmit={goToHolders}>
              <label>
                Tipo de entrada
                <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
                  {(selected.tiposEntrada || []).map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.nombre} — ${t.precio} ({t.disponibles} disp.)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={cantidad}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </label>

              <p className="pe-section">Quién compra</p>
              <label>
                Nombre
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                />
              </label>
              <label>
                Apellido
                <input
                  required
                  value={form.apellido}
                  onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label>
                DNI
                <input
                  value={form.dni}
                  onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
                />
              </label>
              <button type="submit" className="pe-submit">
                Continuar
              </button>
            </form>
          ) : (
            <form className="pe-form" onSubmit={checkout}>
              <div className="pe-holders">
                <div className="pe-holders-head">
                  <p className="pe-section">Quién entra</p>
                  <button type="button" className="pe-link" onClick={copyBuyerToFirst}>
                    La primera soy yo
                  </button>
                </div>
                <p className="pe-muted pe-small">
                  Cada entrada lleva el nombre y el DNI de la persona que va a pasar. En la puerta se pide el DNI y se compara con el QR.
                </p>
                {holders.slice(0, Number(cantidad) || 1).map((h, i) => (
                  <fieldset key={i} className="pe-holder">
                    <legend>Entrada {i + 1}</legend>
                    <label>
                      Nombre
                      <input
                        required
                        value={h.nombre}
                        onChange={(e) => updateHolder(i, 'nombre', e.target.value)}
                      />
                    </label>
                    <label>
                      Apellido
                      <input
                        required
                        value={h.apellido}
                        onChange={(e) => updateHolder(i, 'apellido', e.target.value)}
                      />
                    </label>
                    <label>
                      DNI
                      <input
                        required
                        inputMode="numeric"
                        value={h.dni}
                        onChange={(e) => updateHolder(i, 'dni', e.target.value.replace(/\D/g, ''))}
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
              <div className="pe-actions">
                <button type="button" className="pe-back" onClick={() => { setError(''); setStep(1); }}>
                  Atrás
                </button>
                <button type="submit" className="pe-submit" disabled={submitting}>
                  {submitting ? 'Procesando…' : 'Comprar entradas'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {success ? (
        <div className="pe-success">
          <h2>{success.evento?.titulo || 'Tus entradas'}</h2>
          {success.evento?.fechaInicio || success.evento?.lugar ? (
            <p className="pe-muted">
              {formatWhen(success.evento?.fechaInicio)}
              {success.evento?.lugar ? ` · ${success.evento.lugar}` : ''}
            </p>
          ) : (
            <p className="pe-muted">
              Orden {success.orderId} · Total ${success.montoTotal}
            </p>
          )}
          {(success.tickets || []).length === 0 ? (
            <p>El pago todavía no está confirmado. Cuando se acredite, este mismo link muestra los QR.</p>
          ) : null}
          {(success.tickets || []).map((t) => (
            <div key={t._id || t.codigo} className="pe-ticket">
              <strong>{t.tipoEntradaNombre || 'Entrada'}</strong>
              {t.titular?.nombre || t.titular?.apellido ? (
                <p>
                  {`${t.titular.apellido || ''} ${t.titular.nombre || ''}`.trim()}
                  {t.titular.dni ? ` · DNI ${t.titular.dni}` : ''}
                </p>
              ) : null}
              <p>Código {t.codigo}</p>
              {t.qrValue ? (
                <img
                  alt="QR entrada"
                  className="pe-qr"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(t.qrValue)}`}
                />
              ) : null}
              <p className="pe-muted pe-small">Guardá una captura del QR para el ingreso.</p>
            </div>
          ))}
          <button type="button" className="pe-back" onClick={viewingTickets ? leaveTickets : backToList}>
            Volver a eventos
          </button>
        </div>
      ) : null}
    </div>
  );
}
