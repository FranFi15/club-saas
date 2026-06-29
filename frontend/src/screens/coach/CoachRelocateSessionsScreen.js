import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { isoCalendarDateToDisplay, isoCalendarWeekday } from '../../utils/dateDisplay';
import { sessionDisplayName } from '../../utils/sessionDisplay';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function emptyDraft() {
  return { mode: 'espacio', espacioId: '', lugarExterno: '' };
}

function sessionRowLabel(s) {
  const weekday = isoCalendarWeekday(s.fecha, { style: 'long' });
  const cal = isoCalendarDateToDisplay(s.fecha);
  return `${weekday} ${cal} · ${s.horaInicio}–${s.horaFin}`.trim();
}

function draftIsValid(draft) {
  if (draft.mode === 'externo') {
    return (draft.lugarExterno || '').trim().length >= 3;
  }
  return Boolean(draft.espacioId);
}

function intersectSpaces(lists) {
  const valid = lists.filter((l) => Array.isArray(l) && l.length);
  if (!valid.length) return [];
  let result = valid[0];
  for (let i = 1; i < valid.length; i++) {
    const ids = new Set(valid[i].map((x) => String(x._id)));
    result = result.filter((x) => ids.has(String(x._id)));
  }
  return result;
}

function currentLocationLabel(s) {
  if ((s.lugarExterno || '').trim()) return s.lugarExterno.trim();
  return s.espacio?.nombre || 'Sin lugar';
}

export default function CoachRelocateSessionsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const cacheKey = clubData?.urlIdentifier ? `coach-relocate:${clubData.urlIdentifier}` : '';

  const [sessions, setSessions] = useState([]);
  const [restorableSessions, setRestorableSessions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [selectedRestore, setSelectedRestore] = useState(() => new Set());
  const [batchMode, setBatchMode] = useState('espacio');
  const [batchEspacioId, setBatchEspacioId] = useState('');
  const [batchExterno, setBatchExterno] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message, onConfirm) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  };

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchData = useCallback(async () => {
    const h = await headers();
    const [sessRes, restoreRes] = await Promise.all([
      clubApi.get('/sessions/reubicacion-pendiente', { headers: h }),
      clubApi.get('/sessions/restauracion-disponible', { headers: h }),
    ]);
    return {
      sessions: sessRes.data?.sesiones || [],
      restorableSessions: restoreRes.data?.sesiones || [],
    };
  }, [headers]);

  const applyFetched = useCallback((data) => {
    const list = data.sessions || [];
    const restoreList = data.restorableSessions || [];
    setSessions(list);
    setRestorableSessions(restoreList);
    setDrafts((prev) => {
      const next = { ...prev };
      list.forEach((s) => {
        const id = String(s._id);
        if (!next[id]) next[id] = emptyDraft();
      });
      return next;
    });
    setSelected(new Set());
    setSelectedRestore(new Set());
  }, []);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData,
    onFetched: applyFetched,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las sesiones.');
    },
  });

  useFocusEffect(
    useCallback(() => {
      return () => setAlertConfig((p) => ({ ...p, visible: false }));
    }, []),
  );

  const batchFreeSpaces = useMemo(() => {
    if (!selected.size) return [];
    const lists = sessions
      .filter((s) => selected.has(String(s._id)))
      .map((s) => s.espaciosLibres || []);
    return intersectSpaces(lists);
  }, [sessions, selected]);

  const updateDraft = (sessionId, patch) => {
    const id = String(sessionId);
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyDraft()), ...patch } }));
  };

  const toggleSelected = (sessionId) => {
    const id = String(sessionId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectedRestore = (sessionId) => {
    const id = String(sessionId);
    setSelectedRestore((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRestore = () => {
    if (selectedRestore.size === restorableSessions.length) {
      setSelectedRestore(new Set());
    } else {
      setSelectedRestore(new Set(restorableSessions.map((s) => String(s._id))));
    }
  };

  const restoreSelected = async () => {
    if (!selectedRestore.size) {
      showAlert('Selección', 'Marcá al menos una sesión para restaurar.');
      return;
    }

    setRestoring(true);
    try {
      const h = await headers();
      const { data } = await clubApi.patch(
        '/sessions/restauracion/bulk',
        { sessionIds: Array.from(selectedRestore) },
        { headers: h },
      );
      let msg = `Se restauraron ${data.savedCount} sesión${data.savedCount === 1 ? '' : 'es'} al espacio original.`;
      if (data.errorCount > 0) {
        msg += `\n\n${data.errorCount} no se pudieron restaurar:\n${data.errors
          .slice(0, 3)
          .map((e) => `· ${e.message}`)
          .join('\n')}`;
      }
      await reload({ background: true });
      showAlert(data.errorCount ? 'Restauración parcial' : 'Listo', msg, () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        if (data.savedCount > 0 && data.errorCount === 0 && !sessions.length) {
          navigation.goBack();
        }
      });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron restaurar las sesiones.');
    } finally {
      setRestoring(false);
    }
  };

  const applyBatchToSelected = () => {
    if (!selected.size) {
      showAlert('Selección', 'Marcá al menos una sesión.');
      return;
    }
    if (batchMode === 'externo') {
      const ext = batchExterno.trim();
      if (ext.length < 3) {
        showAlert('Sede externa', 'Escribí la sede (mín. 3 caracteres).');
        return;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        selected.forEach((id) => {
          next[id] = { mode: 'externo', espacioId: '', lugarExterno: ext };
        });
        return next;
      });
    } else {
      if (!batchEspacioId) {
        showAlert('Espacio', 'Elegí un espacio del club.');
        return;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        selected.forEach((id) => {
          next[id] = { mode: 'espacio', espacioId: batchEspacioId, lugarExterno: '' };
        });
        return next;
      });
    }
    showAlert('Listo', `Se aplicó el lugar a ${selected.size} sesión${selected.size === 1 ? '' : 'es'}.`);
  };

  const saveAll = async () => {
    const assignments = sessions
      .map((s) => {
        const draft = drafts[String(s._id)] || emptyDraft();
        if (!draftIsValid(draft)) return null;
        return {
          sessionId: s._id,
          tipo: draft.mode,
          espacioId: draft.mode === 'espacio' ? draft.espacioId : undefined,
          lugarExterno: draft.mode === 'externo' ? draft.lugarExterno.trim() : undefined,
        };
      })
      .filter(Boolean);

    if (!assignments.length) {
      showAlert('Sin cambios', 'Configurá el lugar de al menos una sesión antes de guardar.');
      return;
    }

    setSaving(true);
    try {
      const h = await headers();
      const { data } = await clubApi.patch('/sessions/reubicacion/bulk', { assignments }, { headers: h });
      let msg = `Se guardaron ${data.savedCount} sesión${data.savedCount === 1 ? '' : 'es'}.`;
      if (data.errorCount > 0) {
        msg += `\n\n${data.errorCount} no se pudieron guardar:\n${data.errors
          .slice(0, 3)
          .map((e) => `· ${e.message}`)
          .join('\n')}`;
      }
      await reload({ background: true });
      showAlert(data.errorCount ? 'Guardado parcial' : 'Listo', msg, () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        if (data.savedCount > 0 && data.errorCount === 0) {
          navigation.goBack();
        }
      });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron guardar los lugares.');
    } finally {
      setSaving(false);
    }
  };

  const renderRestoreCard = (s) => {
    const id = String(s._id);
    const isSelected = selectedRestore.has(id);
    const homeName = s.espacioSuspendido?.nombre || 'Espacio original';

    return (
      <View key={`restore-${id}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity style={styles.cardTop} onPress={() => toggleSelectedRestore(id)} activeOpacity={0.85}>
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={22}
            color={isSelected ? '#22c55e' : theme.textMuted}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{sessionRowLabel(s)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {s.categoria?.nombre} · {sessionDisplayName(s)}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
              Ahora: {currentLocationLabel(s)}
            </Text>
            <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              Volver a: {homeName}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSessionCard = (s) => {
    const id = String(s._id);
    const draft = drafts[id] || emptyDraft();
    const isSelected = selected.has(id);
    const sessionFreeSpaces = s.espaciosLibres || [];

    return (
      <View key={id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity style={styles.cardTop} onPress={() => toggleSelected(id)} activeOpacity={0.85}>
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={22}
            color={isSelected ? colorMarca : theme.textMuted}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{sessionRowLabel(s)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {s.categoria?.nombre} · {sessionDisplayName(s)}
            </Text>
            {s.espacioSuspendido?.nombre ? (
              <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 4 }}>
                Antes: {s.espacioSuspendido.nombre}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.modeRow}>
          {[
            { key: 'espacio', label: 'Espacio del club' },
            { key: 'externo', label: 'Sede externa' },
          ].map((opt) => {
            const active = draft.mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.modeChip,
                  {
                    borderColor: active ? colorMarca : theme.border,
                    backgroundColor: active ? colorMarca + '18' : theme.background,
                  },
                ]}
                onPress={() => updateDraft(id, { mode: opt.key })}
              >
                <Text style={{ color: active ? colorMarca : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {draft.mode === 'externo' ? (
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            placeholder="Ej. Club visitante, cancha municipal…"
            placeholderTextColor={theme.textMuted}
            value={draft.lugarExterno}
            onChangeText={(t) => updateDraft(id, { lugarExterno: t })}
          />
        ) : sessionFreeSpaces.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {sessionFreeSpaces.map((sp) => {
              const active = draft.espacioId === sp._id;
              return (
                <TouchableOpacity
                  key={sp._id}
                  style={[
                    styles.spaceChip,
                    {
                      borderColor: active ? colorMarca : theme.border,
                      backgroundColor: active ? colorMarca + '22' : theme.background,
                    },
                  ]}
                  onPress={() => updateDraft(id, { espacioId: sp._id })}
                >
                  <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{sp.nombre}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>
            No hay espacios libres en ese horario. Usá sede externa.
          </Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Agenda"
        title="Gestionar lugares"
        subtitle="Reubicá sesiones o volvé al espacio original cuando esté disponible"
        onBack={() => navigation.goBack()}
      />

      {loading && !sessions.length && !restorableSessions.length ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 40 }} size="large" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
        >
          {restorableSessions.length > 0 ? (
            <>
              <View style={[styles.sectionHeader, { borderColor: theme.border }]}>
                <Ionicons name="home-outline" size={20} color="#22c55e" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Volver al espacio original</Text>
              </View>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Estos espacios ya están disponibles. Podés devolver las sesiones afectadas a su lugar habitual.
              </Text>
              <TouchableOpacity onPress={toggleAllRestore} style={styles.selectAllRow}>
                <Text style={{ color: colorMarca, fontWeight: '700' }}>
                  {selectedRestore.size === restorableSessions.length ? 'Desmarcar todas' : 'Seleccionar todas'}
                </Text>
              </TouchableOpacity>
              {restorableSessions.map(renderRestoreCard)}
              <TouchableOpacity
                style={[styles.restoreBtn, { backgroundColor: '#22c55e', opacity: restoring ? 0.7 : 1 }]}
                onPress={restoreSelected}
                disabled={restoring}
              >
                {restoring ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnTxt}>
                    Restaurar{selectedRestore.size ? ` (${selectedRestore.size})` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {sessions.length > 0 ? (
            <>
              {restorableSessions.length > 0 ? (
                <View style={[styles.sectionHeader, { borderColor: theme.border, marginTop: 20 }]}>
                  <Ionicons name="swap-horizontal" size={20} color="#f59e0b" />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Reubicar sesiones</Text>
                </View>
              ) : null}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Marcá varias sesiones y aplicales el mismo lugar, o configurá cada una por separado.
              </Text>

              {selected.size > 0 ? (
                <View style={[styles.batchPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>
                    Aplicar a {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
                  </Text>
                  <View style={styles.modeRow}>
                    {[
                      { key: 'espacio', label: 'Espacio club' },
                      { key: 'externo', label: 'Sede externa' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.modeChip,
                          {
                            borderColor: batchMode === opt.key ? colorMarca : theme.border,
                            backgroundColor: batchMode === opt.key ? colorMarca + '18' : theme.background,
                          },
                        ]}
                        onPress={() => setBatchMode(opt.key)}
                      >
                        <Text
                          style={{
                            color: batchMode === opt.key ? colorMarca : theme.text,
                            fontWeight: '700',
                            fontSize: 12,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {batchMode === 'externo' ? (
                    <TextInput
                      style={[
                        styles.input,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      placeholder="Sede para las seleccionadas"
                      placeholderTextColor={theme.textMuted}
                      value={batchExterno}
                      onChangeText={setBatchExterno}
                    />
                  ) : batchFreeSpaces.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                      {batchFreeSpaces.map((sp) => (
                        <TouchableOpacity
                          key={sp._id}
                          style={[
                            styles.spaceChip,
                            {
                              borderColor: batchEspacioId === sp._id ? colorMarca : theme.border,
                              backgroundColor: batchEspacioId === sp._id ? colorMarca + '22' : theme.background,
                            },
                          ]}
                          onPress={() => setBatchEspacioId(sp._id)}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{sp.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>
                      Ningún espacio está libre para todas las sesiones seleccionadas.
                    </Text>
                  )}
                  <TouchableOpacity
                    style={[styles.batchBtn, { backgroundColor: colorMarca }]}
                    onPress={applyBatchToSelected}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Aplicar a seleccionadas</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {sessions.map(renderSessionCard)}

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                onPress={saveAll}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnTxt}>Guardar lugares</Text>
                )}
              </TouchableOpacity>
            </>
          ) : restorableSessions.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>No hay sesiones pendientes de gestión.</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  selectAllRow: { marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 10 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 14,
  },
  chipsScroll: { paddingVertical: 2 },
  spaceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  batchPanel: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  batchBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  restoreBtn: { marginTop: 4, marginBottom: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
