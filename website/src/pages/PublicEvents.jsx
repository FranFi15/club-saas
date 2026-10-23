import { useEffect, useMemo, useRef, useState } from 'react';
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

function formatDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatClock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function SeatBoard({ children }) {
  const viewRef = useRef(null);
  const trackRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const moved = useRef(false);
  const moveRef = useRef(null);
  const endRef = useRef(null);
  const windowMove = useRef((event) => moveRef.current?.(event));
  const windowEnd = useRef((event) => endRef.current?.(event));
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const fitRef = useRef(1);
  const naturalRef = useRef({ w: 1, h: 1 });
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 1, h: 1 });

  const measure = () => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track) return;
    const w = track.scrollWidth || 1;
    const h = track.scrollHeight || 1;
    const nextFit = Math.min(1, view.clientWidth / w);
    naturalRef.current = { w, h };
    fitRef.current = nextFit;
    setNatural({ w, h });
    setFit(nextFit);
  };

  useEffect(() => {
    measure();
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    if (track) observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const maxZoom = Math.min(8, Math.max(2.5, 42 / 36 / Math.max(fit, 0.05)));
  const scale = fit * zoom;
  const viewH = Math.max(72, natural.h * fit);

  const clampPan = (next, z) => {
    const view = viewRef.current;
    const s = fitRef.current * z;
    const width = view?.clientWidth || 0;
    const height = naturalRef.current.h * fitRef.current;
    return {
      x: Math.min(0, Math.max(Math.min(0, width - naturalRef.current.w * s), next.x)),
      y: Math.min(0, Math.max(Math.min(0, height - naturalRef.current.h * s), next.y)),
    };
  };

  const applyZoom = (nextZoom, focusX, focusY) => {
    const prevScale = fitRef.current * zoomRef.current || 1;
    const z = Math.max(1, Math.min(maxZoom, nextZoom));
    const nextScale = fitRef.current * z;
    const nextPan = clampPan(
      {
        x: focusX - ((focusX - panRef.current.x) / prevScale) * nextScale,
        y: focusY - ((focusY - panRef.current.y) / prevScale) * nextScale,
      },
      z,
    );
    zoomRef.current = z;
    panRef.current = nextPan;
    setZoom(z);
    setPan(nextPan);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', windowMove.current);
    window.removeEventListener('pointerup', windowEnd.current);
    window.removeEventListener('pointercancel', windowEnd.current);
  }, []);

  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const view = viewRef.current;
    const pts = [...pointers.current.values()];
    if (!view || !pts.length) return;
    const rect = view.getBoundingClientRect();
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!gesture.current || gesture.current.type !== 'pinch') {
        gesture.current = { type: 'pinch', dist, zoom: zoomRef.current };
      }
      moved.current = true;
      applyZoom(
        gesture.current.zoom * (dist / (gesture.current.dist || dist)),
        (pts[0].x + pts[1].x) / 2 - rect.left,
        (pts[0].y + pts[1].y) / 2 - rect.top,
      );
      return;
    }
    if (gesture.current?.type !== 'pan' || zoomRef.current <= 1.01) return;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (Math.hypot(dx, dy) <= 8) return;
    moved.current = true;
    const next = clampPan({ x: gesture.current.pan.x + dx, y: gesture.current.pan.y + dy }, zoomRef.current);
    panRef.current = next;
    setPan(next);
  };

  const endPointer = (event) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2 && gesture.current?.type === 'pinch') {
      const left = [...pointers.current.entries()][0];
      gesture.current = left
        ? { type: 'pan', x: left[1].x, y: left[1].y, pan: { ...panRef.current } }
        : null;
    }
    if (!pointers.current.size) {
      gesture.current = null;
      window.removeEventListener('pointermove', windowMove.current);
      window.removeEventListener('pointerup', windowEnd.current);
      window.removeEventListener('pointercancel', windowEnd.current);
    }
  };

  moveRef.current = onPointerMove;
  endRef.current = endPointer;

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const first = pointers.current.size === 0;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current = { type: 'pinch', dist, zoom: zoomRef.current };
      moved.current = true;
    } else {
      moved.current = false;
      gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, pan: { ...panRef.current } };
    }
    if (!first) return;
    window.addEventListener('pointermove', windowMove.current);
    window.addEventListener('pointerup', windowEnd.current);
    window.addEventListener('pointercancel', windowEnd.current);
  };

  const onClickCapture = (event) => {
    if (!moved.current) return;
    event.preventDefault();
    event.stopPropagation();
    moved.current = false;
  };

  return (
    <div className="pe-zoom">
      <div className="pe-zoom-bar">
        <button
          type="button"
          className="pe-zoom-btn"
          aria-label="Alejar"
          disabled={zoom <= 1.01}
          onClick={() => applyZoom(zoomRef.current / 1.4, (viewRef.current?.clientWidth || 0) / 2, viewH / 2)}
        >
          −
        </button>
        <button
          type="button"
          className="pe-zoom-btn"
          aria-label="Acercar"
          disabled={zoom >= maxZoom - 0.05}
          onClick={() => applyZoom(zoomRef.current * 1.4, (viewRef.current?.clientWidth || 0) / 2, viewH / 2)}
        >
          +
        </button>
      </div>
      <div
        ref={viewRef}
        className="pe-zoom-view"
        data-tiny={scale < 0.55 ? '1' : '0'}
        style={{ height: viewH }}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        <div
          ref={trackRef}
          className="pe-zoom-track"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('es-AR');
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
  const [seats, setSeats] = useState([]);
  const [openSection, setOpenSection] = useState('');
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
      setSeats([]);
      setOpenSection('');
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
    const qty = sectionsForTipo.length ? seats.length : Number(cantidad) || 1;
    if (sectionsForTipo.length && !seats.length) {
      setError('Elegí un asiento en el plano.');
      return;
    }
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
    const needsSeat = (selected.secciones || []).some((section) => String(section.tipoEntrada) === String(tipoId));
    const qty = needsSeat ? seats.length : Number(cantidad) || 1;
    if (needsSeat && !seats.length) {
      setError('Elegí un asiento en el plano.');
      return;
    }
    const asistentes = holders.slice(0, qty).map((h, index) => ({
      nombre: h.nombre.trim(),
      apellido: h.apellido.trim(),
      dni: h.dni.replace(/\D/g, ''),
      asiento: seats[index]
        ? {
            seccionId: seats[index].seccionId,
            seccionNombre: seats[index].seccionNombre,
            fila: seats[index].fila,
            numero: seats[index].numero,
          }
        : undefined,
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
  const selectedTipo = (selected?.tiposEntrada || []).find((t) => String(t._id) === String(tipoId));
  const sectionsForTipo = (selected?.secciones || []).filter(
    (section) => String(section.tipoEntrada) === String(tipoId),
  );
  const openSeatSection =
    sectionsForTipo.find((section) => String(section._id) === String(openSection)) || sectionsForTipo[0];
  const ticketTotal = selectedTipo
    ? (sectionsForTipo.length ? seats.length || 0 : Number(cantidad) || 1) * (Number(selectedTipo.precio) || 0)
    : null;

  useEffect(() => {
    if (!sectionsForTipo.length || !seats.length) return;
    setCantidad(seats.length);
    setHolders((prev) => {
      const next = prev.slice(0, seats.length);
      while (next.length < seats.length) next.push({ nombre: '', apellido: '', dni: '' });
      return next;
    });
  }, [seats, sectionsForTipo.length]);

  return (
    <div className={`pe-page${showEvent ? ' pe-page--event' : ''}`} style={{ '--pe-brand': brand }}>
      {heroUrl ? <img className="pe-hero" src={heroUrl} alt="" /> : null}
      <div className={showEvent ? 'pe-event-wrap' : undefined}>
      {showEvent ? (
        <header className="pe-header">
          <div className="pe-brand">
            {clubMeta?.logoUrl ? (
              <img className="pe-logo" src={clubMeta.logoUrl} alt={clubMeta.nombre || 'Club'} />
            ) : (
              <p className="pe-kicker">{clubMeta?.nombre || 'Club'}</p>
            )}
          </div>
          <button type="button" className="pe-back" onClick={viewingTickets ? leaveTickets : backToList}>
            ← Todos los eventos
          </button>
        </header>
      ) : (
        <header className="pe-header pe-header--catalog">
          {clubMeta?.logoUrl ? (
            <img className="pe-logo" src={clubMeta.logoUrl} alt={clubMeta.nombre || 'Club'} />
          ) : (
            <p className="pe-kicker">{clubMeta?.nombre || 'Club'}</p>
          )}
          <h1>Adquirí tus tickets de los próximos eventos</h1>
        </header>
      )}

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
        <div className="pe-event-layout">
          <section className="pe-event-info">
            <h2>{selected.titulo}</h2>
            <div className="pe-facts">
              {selected.fechaInicio ? (
                <div className="pe-fact">
                  <span className="pe-fact-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                  </span>
                  <span>
                    <strong>{formatDay(selected.fechaInicio)}</strong>
                    <small>{formatClock(selected.fechaInicio)}</small>
                  </span>
                </div>
              ) : null}
              {selected.lugar ? (
                <div className="pe-fact">
                  <span className="pe-fact-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <span>
                    <strong>Lugar</strong>
                    <small>{selected.lugar}</small>
                  </span>
                </div>
              ) : null}
            </div>
            {selected.descripcion ? <p className="pe-desc">{selected.descripcion}</p> : null}
          </section>

          <section className="pe-buy">
          <ol className="pe-steps">
            <li className={step === 1 ? 'is-on' : 'is-done'}>1. Compra</li>
            <li className={step === 2 ? 'is-on' : ''}>2. Entradas</li>
          </ol>

          {step === 1 ? (
            <form className="pe-form" onSubmit={goToHolders}>
              <label>
                Tipo de entrada
                <select
                  value={tipoId}
                  onChange={(e) => {
                    setTipoId(e.target.value);
                    setSeats([]);
                    setOpenSection('');
                  }}
                  required
                >
                  {(selected.tiposEntrada || []).map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.nombre} — {Number(t.precio) === 0 ? 'Gratis' : `$${formatMoney(t.precio)}`} ({t.disponibles} disp.)
                    </option>
                  ))}
                </select>
              </label>
              {sectionsForTipo.length ? (
                <div className="pe-seatmap">
                  <span>Elegí tu lugar</span>
                  <p className="pe-muted pe-small">Tocá un sector y después el asiento.</p>
                  {selected.mapaEstadioUrl ? (
                    <div className="pe-map">
                      <img src={selected.mapaEstadioUrl} alt="" />
                      {sectionsForTipo.map((section) => {
                        const hasArea = Number(section.w) > 0 && Number(section.h) > 0;
                        const on = openSeatSection && String(openSeatSection._id) === String(section._id);
                        return (
                          <button
                            key={section._id}
                            type="button"
                            className={`${hasArea ? 'pe-area' : 'pe-pin'}${on ? ' is-on' : ''}`}
                            style={
                              hasArea
                                ? {
                                    left: `${section.x || 0}%`,
                                    top: `${section.y || 0}%`,
                                    width: `${section.w}%`,
                                    height: `${section.h}%`,
                                  }
                                : { left: `${section.x || 0}%`, top: `${section.y || 0}%` }
                            }
                            onClick={() => setOpenSection(String(section._id))}
                          >
                            {section.nombre}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {sectionsForTipo.length > 1 ? (
                    <div className="pe-section-chips">
                      {sectionsForTipo.map((section) => (
                        <button
                          key={`chip-${section._id}`}
                          type="button"
                          className={`pe-section-chip${openSeatSection && String(openSeatSection._id) === String(section._id) ? ' is-on' : ''}`}
                          onClick={() => setOpenSection(String(section._id))}
                        >
                          {section.nombre}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="pe-legend">
                    <span><i className="pe-swatch" /> Libre</span>
                    <span><i className="pe-swatch is-on" /> Elegido</span>
                    <span><i className="pe-swatch is-off" /> Ocupado</span>
                  </div>
                  {openSeatSection ? (
                    <div className="pe-seat-grid">
                      <div className="pe-pitch">Cancha</div>
                      <p className="pe-muted pe-small">
                        {openSeatSection.nombre}. La fila 1 es la más cercana a la cancha. Se ven todos: acercá con + para elegir.
                      </p>
                      <SeatBoard key={openSeatSection._id}>
                        {Array.from({ length: Number(openSeatSection.filas) || 0 }, (_, row) => (
                          <div key={`row-${row + 1}`} className="pe-seat-row">
                            <span><small>Fila</small>{row + 1}</span>
                            {Array.from({ length: Number(openSeatSection.asientosPorFila) || 0 }, (_, col) => {
                              const fila = row + 1;
                              const numero = col + 1;
                              const taken = (selected.ocupados || []).some(
                                (seat) =>
                                  String(seat.seccionId) === String(openSeatSection._id) &&
                                  Number(seat.fila) === fila &&
                                  Number(seat.numero) === numero,
                              );
                              const on = seats.some(
                                (seat) =>
                                  String(seat.seccionId) === String(openSeatSection._id) &&
                                  seat.fila === fila &&
                                  seat.numero === numero,
                              );
                              return (
                                <button
                                  key={`${fila}-${numero}`}
                                  type="button"
                                  className={`pe-seat${on ? ' is-on' : ''}`}
                                  disabled={taken}
                                  aria-label={`Fila ${fila}, asiento ${numero}${taken ? ', ocupado' : ''}`}
                                  onClick={() => {
                                    const seat = {
                                      seccionId: String(openSeatSection._id),
                                      seccionNombre: openSeatSection.nombre,
                                      fila,
                                      numero,
                                    };
                                    setSeats((prev) => {
                                      const exists = prev.some(
                                        (item) =>
                                          item.seccionId === seat.seccionId &&
                                          item.fila === fila &&
                                          item.numero === numero,
                                      );
                                      if (exists) {
                                        return prev.filter(
                                          (item) =>
                                            !(
                                              item.seccionId === seat.seccionId &&
                                              item.fila === fila &&
                                              item.numero === numero
                                            ),
                                        );
                                      }
                                      if (prev.length >= 20) return prev;
                                      return [...prev, seat];
                                    });
                                  }}
                                >
                                  {numero}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </SeatBoard>
                    </div>
                  ) : null}
                  <div className="pe-picked">
                    {seats.length ? (
                      seats.map((seat) => (
                        <button
                          key={`${seat.seccionId}-${seat.fila}-${seat.numero}`}
                          type="button"
                          className="pe-picked-chip"
                          onClick={() =>
                            setSeats((prev) =>
                              prev.filter(
                                (item) =>
                                  !(
                                    item.seccionId === seat.seccionId &&
                                    item.fila === seat.fila &&
                                    item.numero === seat.numero
                                  ),
                              ),
                            )
                          }
                        >
                          {seat.seccionNombre} · Fila {seat.fila} · Asiento {seat.numero} ×
                        </button>
                      ))
                    ) : (
                      <p className="pe-muted pe-small">Todavía no elegiste un asiento.</p>
                    )}
                  </div>
                </div>
              ) : (
              <div className="pe-qty">
                <span>Cantidad</span>
                <div className="pe-qty-controls">
                  <button
                    type="button"
                    onClick={() => setQty(cantidad - 1)}
                    disabled={cantidad <= 1}
                    aria-label="Menos tickets"
                  >
                    −
                  </button>
                  <span className="pe-qty-value">{cantidad}</span>
                  <button
                    type="button"
                    onClick={() => setQty(cantidad + 1)}
                    disabled={cantidad >= 20}
                    aria-label="Más tickets"
                  >
                    +
                  </button>
                </div>
              </div>
              )}
              {ticketTotal != null ? (
                <p className="pe-total">
                  <span>Total</span>
                  <strong>{ticketTotal === 0 ? 'Gratis' : `$${formatMoney(ticketTotal)}`}</strong>
                </p>
              ) : null}

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
          </section>
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
              {t.asiento?.seccionNombre ? (
                <p>
                  {t.asiento.seccionNombre} · fila {t.asiento.fila} · asiento {t.asiento.numero}
                </p>
              ) : null}
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
    </div>
  );
}
