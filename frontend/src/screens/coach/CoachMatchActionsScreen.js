import React, { useCallback, useContext, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { useLandscapeLock } from '../../hooks/useLandscapeLock';
import UserAvatar from '../../components/UserAvatar';
import { MatchMark } from '../../components/MatchMark';
import { countsFor, courtNow, idOf, isCounterTotal, isLimitStat, porcentajeIdsOf, scorePoints, sumsOnlyTotals, suspendedNow } from '../../utils/matchDerive';

function Scoreboard({ ours, theirs, rivalOn, away, color }) {
  const cells = rivalOn
    ? (away
      ? [
        { key: 'local', label: 'Local', value: theirs, ours: false },
        { key: 'visita', label: 'Visita', value: ours, ours: true },
      ]
      : [
        { key: 'local', label: 'Local', value: ours, ours: true },
        { key: 'visita', label: 'Visita', value: theirs, ours: false },
      ])
    : [{ key: 'nosotros', label: 'Nosotros', value: ours, ours: true }];
  return (
    <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden' }}>
      {cells.map((cell) => (
        <View
          key={cell.key}
          style={{ minWidth: 52, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, backgroundColor: cell.ours ? color : '#9ca3af' }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{cell.label}</Text>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18 }}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

function personName(user) {
  if (!user || typeof user !== 'object') return 'Jugador';
  return `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Jugador';
}

function clockLabel(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function laterFirst(a, b) {
  const ap = Number(a.periodo) || 1;
  const bp = Number(b.periodo) || 1;
  if (ap !== bp) return bp - ap;
  return (Number(a.relojMs) || 0) - (Number(b.relojMs) || 0);
}

export default function CoachMatchActionsScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const sessionId = route.params?.sessionId;
  useLandscapeLock();
  const [session, setSession] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editSide, setEditSide] = useState('nosotros');
  const [error, setError] = useState('');

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  }, [clubData?.urlIdentifier]);

  const load = useCallback(async () => {
    const h = await headers();
    const { data } = await clubApi.get(`/sessions/${sessionId}`, { headers: h });
    setSession(data);
  }, [headers, sessionId]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const mutate = async (method, path, body) => {
    const h = await headers();
    const { data } = await clubApi({ method, url: path, data: body, headers: h });
    setSession(data);
    setEditing(null);
  };

  const campos = session?.planilla?.campos || [];
  const jugadores = (session?.listaBuenaFe || []).filter((row) => row.tipoPersona !== 'staff');
  const rivalActivo = session?.planilla?.rival?.activo === true;
  const rivalLineup = rivalActivo && session?.planilla?.rival?.modo === 'alineacion';
  const contarPosesion = session?.planilla?.reloj?.posesion !== false;
  const onCourt = courtNow(session?.relojEventos || []);
  const nuestroScore = scorePoints(session?.jugadas, campos, 'nosotros');
  const rivalScore = scorePoints(session?.jugadas, campos, 'rival');
  const jugadas = session?.jugadas || [];
  const totales = campos
    .filter((campo) => campo.tipo === 'total' || isLimitStat(campo) || campo.tipo === 'porcentaje')
    .map((campo) => {
      const ids = isCounterTotal(campo) || isLimitStat(campo) || campo.tipo === 'porcentaje'
        ? [campo._id]
        : [...porcentajeIdsOf(campo, campos)];
      return {
        campo,
        partes: (campo.camposTotal || [])
          .map((id) => campos.find((item) => String(item._id) === String(id)))
          .filter(Boolean)
          .map((item) => item.etiqueta),
        ours: countsFor(jugadas, null, ids, 'nosotros'),
        rival: countsFor(jugadas, null, ids, 'rival'),
      };
    });
  const rows = [
    ...jugadas.map((play) => ({ ...play, kind: 'jugada', play })),
    ...(contarPosesion ? (session?.posesiones || []) : []).map((row) => ({ ...row, kind: 'posesion', row })),
  ].sort(laterFirst);

  const summaryValue = ({ campo, anoto, erro, porcentaje }) => {
    if (isLimitStat(campo)) return `${anoto}/${Number(campo.limite) || 5}`;
    if (isCounterTotal(campo) || sumsOnlyTotals(campo, campos)) return String(anoto);
    return `${anoto}/${anoto + erro}${porcentaje == null ? '' : ` · ${porcentaje}%`}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 }}>
        <View style={{ position: 'absolute', left: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colorMarca }}
          >
            <Ionicons name="chevron-back" size={14} color={colorMarca} />
            <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>Volver</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Acciones</Text>
        <View style={{ position: 'absolute', right: 8 }}>
          <Scoreboard
            ours={nuestroScore}
            theirs={rivalScore}
            rivalOn={rivalActivo}
            away={Boolean(String(session?.lugarExterno || '').trim()) && !session?.espacio}
            color={colorMarca}
          />
        </View>
      </View>
      {error ? <Text style={{ color: '#ef4444', paddingHorizontal: 12, paddingBottom: 4, fontSize: 13 }}>{error}</Text> : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16, gap: 10 }}>
        {totales.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
            {totales.map(({ campo, partes, ours, rival }) => (
              <View key={campo._id} style={{ minWidth: 120, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{campo.etiqueta}</Text>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginTop: 2 }}>{summaryValue({ campo, ...ours })}</Text>
                {rivalActivo ? <Text style={{ color: '#9ca3af', fontWeight: '800', fontSize: 14, marginTop: 2 }}>{summaryValue({ campo, ...rival })}</Text> : null}
                {partes.length ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{partes.join(' + ')}</Text> : null}
              </View>
            ))}
          </ScrollView>
        ) : null}
        {rows.map((item) => {
          if (item.kind === 'posesion') {
            const row = item.row;
            const ours = row.equipo !== 'rival';
            return (
              <View key={row._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: ours ? theme.surface : theme.background, borderWidth: 1, borderColor: ours ? theme.border : '#9ca3af', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 13, width: 72 }}>P{row.periodo} {clockLabel(row.relojMs)}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: ours ? colorMarca : '#9ca3af' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{ours ? 'Nosotros' : 'Rival'}</Text>
                </View>
                <Text style={{ flex: 1, color: ours ? theme.text : '#9ca3af', fontWeight: '700', fontSize: 15 }}>Posesión</Text>
                <TouchableOpacity onPress={() => mutate('patch', `/sessions/${sessionId}/posesiones/${row._id}`, { equipo: ours ? 'rival' : 'nosotros' }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}>
                  <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 13 }}>Cambiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => mutate('delete', `/sessions/${sessionId}/posesiones/${row._id}`).catch((e) => setError(e.response?.data?.message || 'No se pudo quitar.'))}>
                  <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 13 }}>Quitar</Text>
                </TouchableOpacity>
              </View>
            );
          }
          const play = item.play;
          const campo = campos.find((itemCampo) => String(itemCampo._id) === String(play.campoId));
          const counter = isCounterTotal(campo) || isLimitStat(campo);
          const made = play.resultado === 'anoto';
          const player = jugadores.find((row) => idOf(row.usuario) === idOf(play.usuario));
          const rivalPlayer = (session?.rivalAlineacion || []).find((row) => String(row._id) === String(play.rivalJugador));
          const side = play.equipo === 'rival' ? 'rival' : 'nosotros';
          const who = side === 'rival'
            ? (rivalPlayer
              ? (rivalPlayer.nombre?.trim()
                ? `${rivalPlayer.dorsal || '–'} ${rivalPlayer.nombre.trim()}`
                : `Jugador ${rivalPlayer.dorsal || '–'}`)
              : 'Rival')
            : personName(player?.usuario);
          const open = editing === play._id;
          const suspended = suspendedNow(session?.relojEventos || [], play.periodo);
          const ourPlayers = onCourt.length
            ? [
              ...jugadores.filter((row) => onCourt.includes(idOf(row.usuario))),
              ...jugadores.filter((row) => suspended.has(idOf(row.usuario)) && !onCourt.includes(idOf(row.usuario))),
            ]
            : jugadores;
          const rivalCourt = (session?.rivalAlineacion || []).filter((row) => (session?.rivalEnCancha || []).map(String).includes(String(row._id)));
          const rivalPlay = side === 'rival';
          const badge = rivalPlay ? '#9ca3af' : counter ? colorMarca : made ? '#16a34a' : '#dc2626';
          return (
            <View key={play._id} style={{ backgroundColor: rivalPlay ? theme.background : theme.surface, borderWidth: 1, borderColor: open ? colorMarca : rivalPlay ? '#9ca3af' : theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 13, width: 72 }}>P{play.periodo} {clockLabel(play.relojMs)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: badge }}>
                  {counter ? null : <MatchMark tipo={made ? campo?.iconoAnoto : campo?.iconoErro} size={12} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{counter ? '+1' : made ? 'Anotó' : 'Erró'}</Text>
                </View>
                <Text style={{ flex: 1, color: rivalPlay ? '#9ca3af' : theme.text, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{campo?.etiqueta || 'Dato'}</Text>
                {rivalPlay ? null : <UserAvatar user={player?.usuario} size={32} colorMarca={colorMarca} />}
                <Text style={{ color: rivalPlay ? '#9ca3af' : theme.text, fontWeight: '700', fontSize: 14, maxWidth: 140 }} numberOfLines={1}>{who}</Text>
                <TouchableOpacity onPress={() => { if (open) setEditing(null); else { setEditSide(side); setEditing(play._id); } }}>
                  <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 13 }}>{open ? 'Cerrar' : 'Editar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => mutate('delete', `/sessions/${sessionId}/jugadas/${play._id}`).catch((e) => setError(e.response?.data?.message || 'No se pudo quitar.'))}>
                  <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 13 }}>Quitar</Text>
                </TouchableOpacity>
              </View>
              {open ? (
                <View style={{ gap: 8 }}>
                  {rivalActivo ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      {[
                        { id: 'nosotros', label: 'Nosotros' },
                        { id: 'rival', label: 'Rival' },
                      ].map((option) => {
                        const on = editSide === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => setEditSide(option.id)}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca : theme.background }}
                          >
                            <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 13 }}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Estadística</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {campos.filter((itemCampo) => itemCampo.tipo === 'porcentaje' || isCounterTotal(itemCampo) || isLimitStat(itemCampo)).map((itemCampo) => {
                      const on = String(play.campoId) === String(itemCampo._id);
                      return (
                        <TouchableOpacity
                          key={itemCampo._id}
                          activeOpacity={0.75}
                          onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { campoId: itemCampo._id, ...((isCounterTotal(itemCampo) || isLimitStat(itemCampo)) ? { resultado: 'anoto' } : {}) }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca : theme.background }}
                        >
                          <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 13 }}>{itemCampo.etiqueta}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {counter ? null : (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { resultado: 'anoto' }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: made ? '#16a34a' : theme.background, borderWidth: 1, borderColor: '#16a34a' }}
                      >
                        <Text style={{ color: made ? '#fff' : '#16a34a', fontWeight: '800', fontSize: 13 }}>Anotó</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { resultado: 'erro' }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: !made ? '#dc2626' : theme.background, borderWidth: 1, borderColor: '#dc2626' }}
                      >
                        <Text style={{ color: !made ? '#fff' : '#dc2626', fontWeight: '800', fontSize: 13 }}>Erró</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Jugador</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {rivalActivo && editSide === 'rival' ? (
                      rivalLineup ? (
                        rivalCourt.length ? rivalCourt.map((row) => {
                          const current = String(play.rivalJugador) === String(row._id);
                          return (
                            <TouchableOpacity
                              key={row._id}
                              activeOpacity={0.75}
                              onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { equipo: 'rival', rivalJugador: String(row._id) }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: current ? colorMarca : theme.border,
                                backgroundColor: current ? colorMarca + '18' : theme.background,
                              }}
                            >
                              <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 14 }}>{row.dorsal || '–'}</Text>
                              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{row.nombre?.trim() || 'Jugador'}</Text>
                            </TouchableOpacity>
                          );
                        }) : <Text style={{ color: theme.textMuted, fontWeight: '700' }}>No hay jugadores del rival en cancha.</Text>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { equipo: 'rival' }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: side === 'rival' ? colorMarca : theme.border,
                            backgroundColor: side === 'rival' ? colorMarca + '18' : theme.background,
                          }}
                        >
                          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>Rival</Text>
                        </TouchableOpacity>
                      )
                    ) : (rivalActivo ? ourPlayers : jugadores).map((row) => {
                      const id = idOf(row.usuario);
                      const out = suspended.has(id);
                      const current = side !== 'rival' && id === idOf(play.usuario);
                      const muted = out && !current;
                      return (
                        <TouchableOpacity
                          key={id}
                          disabled={muted}
                          activeOpacity={0.75}
                          onPress={() => mutate('patch', `/sessions/${sessionId}/jugadas/${play._id}`, { equipo: 'nosotros', usuario: id }).catch((e) => setError(e.response?.data?.message || 'No se pudo editar.'))}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: muted ? '#9ca3af' : current ? colorMarca : theme.border,
                            backgroundColor: current ? colorMarca + '18' : theme.background,
                          }}
                        >
                          <UserAvatar user={row.usuario} size={28} colorMarca={muted ? '#9ca3af' : colorMarca} />
                          <Text style={{ color: muted ? '#9ca3af' : colorMarca, fontWeight: '800', fontSize: 14 }}>{row.dorsal || '–'}</Text>
                          <Text style={{ color: muted ? '#9ca3af' : theme.text, fontWeight: '800', fontSize: 14 }}>{personName(row.usuario)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {!rows.length ? <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 24 }}>Todavía no hay acciones.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
