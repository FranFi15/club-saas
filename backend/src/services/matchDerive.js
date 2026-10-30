/** Pure helpers for partido sheets. Times are milliseconds remaining on a countdown clock. */

export function idOf(value) {
    if (!value) return '';
    if (typeof value === 'object' && value._id != null) return String(value._id);
    return String(value);
}

export function pct(anoto, erro) {
    const a = Number(anoto) || 0;
    const e = Number(erro) || 0;
    const t = a + e;
    if (t <= 0) return null;
    return Math.round((a / t) * 100);
}

export function courtNow(eventos) {
    const on = [];
    for (const ev of eventos || []) {
        if (ev.tipo === 'quinteto') {
            on.splice(0, on.length, ...(ev.enCancha || []).map(idOf).filter(Boolean));
        } else if (ev.tipo === 'cambio') {
            const sale = idOf(ev.sale);
            const entra = idOf(ev.entra);
            const idx = on.indexOf(sale);
            if (idx >= 0) on.splice(idx, 1);
            if (entra && !on.includes(entra)) on.push(entra);
        }
    }
    return on;
}

/** Players who cannot take a stat at `periodoActual`. Map of user id -> 'temporal' | 'expulsado'. */
export function suspendedNow(eventos, periodoActual) {
    const now = Number(periodoActual) || 1;
    const active = new Map();
    for (const ev of eventos || []) {
        const evPeriod = Number(ev.periodo) || 1;
        if (evPeriod > now) continue;
        const id = idOf(ev.sancionado);
        if (!id) continue;
        if (ev.tipo === 'habilitar') {
            if (active.get(id) === 'temporal') active.delete(id);
        } else if (ev.tipo === 'sancion') {
            if (active.get(id) === 'expulsado') continue;
            active.set(id, ev.alcance === 'expulsado' ? 'expulsado' : 'temporal');
        }
    }
    return active;
}

function credit(times, ids, fromMs, toMs) {
    const delta = Math.max(0, Number(fromMs) - Number(toMs));
    if (!delta) return;
    for (const id of ids) {
        times[id] = (times[id] || 0) + delta;
    }
}

/**
 * Playing time in milliseconds per user id.
 * `live` is { periodo, relojMs } while the clock is still running.
 */
export function playingTimeMs(eventos, live = null) {
    const times = {};
    let on = [];
    let running = false;
    let period = 1;
    let lastMs = null;

    for (const ev of eventos || []) {
        const evPeriod = Number(ev.periodo) || 1;
        const evMs = Number(ev.relojMs) || 0;
        if (running && lastMs != null) {
            if (evPeriod === period) credit(times, on, lastMs, evMs);
            else credit(times, on, lastMs, 0);
        }
        period = evPeriod;
        lastMs = evMs;
        if (ev.tipo === 'inicio') running = true;
        if (ev.tipo === 'pausa' || ev.tipo === 'fin_periodo') running = false;
        if (ev.tipo === 'quinteto') on = (ev.enCancha || []).map(idOf).filter(Boolean);
        if (ev.tipo === 'cambio') {
            const sale = idOf(ev.sale);
            const entra = idOf(ev.entra);
            on = on.filter((id) => id !== sale);
            if (entra) on.push(entra);
        }
    }

    if (live && running && lastMs != null) {
        const livePeriod = Number(live.periodo) || period;
        const liveMs = Number(live.relojMs) || 0;
        if (livePeriod === period) credit(times, on, lastMs, liveMs);
        else credit(times, on, lastMs, 0);
    }

    return times;
}

function teamAt(changes, periodo, relojMs) {
    let team = null;
    for (const change of changes) {
        const cp = Number(change.periodo) || 1;
        const cm = Number(change.relojMs) || 0;
        const earlier = cp < periodo || (cp === periodo && cm >= relojMs);
        if (earlier) team = change.equipo === 'rival' ? 'rival' : 'nosotros';
    }
    return team;
}

/** Possession count and clock time (ms) per team. */
export function possessionSummary(posesiones, eventos, live = null) {
    const summary = {
        nosotros: { cantidad: 0, ms: 0 },
        rival: { cantidad: 0, ms: 0 },
    };
    const changes = [...(posesiones || [])].sort((a, b) => {
        const ap = Number(a.periodo) || 1;
        const bp = Number(b.periodo) || 1;
        if (ap !== bp) return ap - bp;
        return (Number(b.relojMs) || 0) - (Number(a.relojMs) || 0);
    });
    for (const change of changes) {
        const team = change.equipo === 'rival' ? 'rival' : 'nosotros';
        summary[team].cantidad += 1;
    }

    const addInterval = (periodo, fromMs, toMs) => {
        if (!(fromMs > toMs)) return;
        let cursor = fromMs;
        let team = teamAt(changes, periodo, fromMs);
        const inside = changes
            .filter((change) => (Number(change.periodo) || 1) === periodo)
            .filter((change) => {
                const ms = Number(change.relojMs) || 0;
                return ms < fromMs && ms >= toMs;
            })
            .sort((a, b) => (Number(b.relojMs) || 0) - (Number(a.relojMs) || 0));
        for (const change of inside) {
            const at = Number(change.relojMs) || 0;
            if (team && cursor > at) summary[team].ms += cursor - at;
            team = change.equipo === 'rival' ? 'rival' : 'nosotros';
            cursor = at;
        }
        if (team && cursor > toMs) summary[team].ms += cursor - toMs;
    };

    let running = false;
    let period = 1;
    let lastMs = null;
    for (const ev of eventos || []) {
        const evPeriod = Number(ev.periodo) || 1;
        const evMs = Number(ev.relojMs) || 0;
        if (running && lastMs != null) {
            if (evPeriod === period) addInterval(period, lastMs, evMs);
            else addInterval(period, lastMs, 0);
        }
        period = evPeriod;
        lastMs = evMs;
        if (ev.tipo === 'inicio') running = true;
        if (ev.tipo === 'pausa' || ev.tipo === 'fin_periodo') running = false;
    }
    if (live && running && lastMs != null) {
        const livePeriod = Number(live.periodo) || period;
        const liveMs = Number(live.relojMs) || 0;
        if (livePeriod === period) addInterval(period, lastMs, liveMs);
        else addInterval(period, lastMs, 0);
    }

    return summary;
}

/** A total with nothing to add is tapped on the court. Each tap counts as one. */
export function isCounterTotal(campo) {
    return campo?.tipo === 'total' && !(campo.camposTotal || []).length;
}

/** A counted stat with a send-off limit, such as fouls or cards. */
export function isLimitStat(campo) {
    return campo?.tipo === 'limite';
}

export function countsFor(jugadas, usuarioId, campoIds) {
    const ids = new Set((campoIds || []).map(String));
    let anoto = 0;
    let erro = 0;
    for (const play of jugadas || []) {
        if (usuarioId && idOf(play.usuario) !== String(usuarioId)) continue;
        if (ids.size && !ids.has(String(play.campoId))) continue;
        if (play.resultado === 'anoto') anoto += 1;
        else if (play.resultado === 'erro') erro += 1;
    }
    return { anoto, erro, porcentaje: pct(anoto, erro) };
}

/** Made/missed fields reached by a total, including totals that sum other totals. */
export function porcentajeIdsOf(campo, list, seen = new Set(), out = new Set()) {
    const id = String(campo?._id || '');
    if (!id || seen.has(id)) return out;
    seen.add(id);
    if (campo.tipo === 'porcentaje' || isCounterTotal(campo)) {
        out.add(id);
        return out;
    }
    if (campo.tipo !== 'total') return out;
    for (const ref of campo.camposTotal || []) {
        const child = (list || []).find((item) => String(item._id) === String(ref));
        if (child) porcentajeIdsOf(child, list, seen, out);
    }
    return out;
}

export function statRows(campos, jugadas, usuarioId) {
    const list = campos || [];
    return list
        .filter((campo) => campo.alcance !== 'partido' || campo.tipo === 'total' || campo.tipo === 'porcentaje')
        .map((campo) => {
            if (campo.tipo === 'porcentaje') {
                const counts = countsFor(jugadas, campo.alcance === 'partido' ? null : usuarioId, [campo._id]);
                return { campo, ...counts };
            }
            if (campo.tipo === 'limite') {
                const counts = countsFor(jugadas, usuarioId, [campo._id]);
                return { campo, ...counts };
            }
            if (campo.tipo === 'total') {
                const usuario = campo.alcance === 'partido' ? null : usuarioId;
                const ids = isCounterTotal(campo) ? [campo._id] : [...porcentajeIdsOf(campo, list)];
                const counts = countsFor(jugadas, usuario, ids);
                const partes = (campo.camposTotal || [])
                    .map((ref) => (list || []).find((item) => String(item._id) === String(ref)))
                    .filter(Boolean)
                    .map((item) => ({
                        etiqueta: item.etiqueta,
                        ...countsFor(jugadas, usuario, [...porcentajeIdsOf(item, list)]),
                    }));
                return { campo, ...counts, partes };
            }
            return null;
        })
        .filter(Boolean);
}

