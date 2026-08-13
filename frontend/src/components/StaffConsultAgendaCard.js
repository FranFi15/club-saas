import React, { useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { getToken } from '../utils/storage';
import { clubApi } from '../utils/api';
import CustomAlert from './CustomAlert';
import {
  consultaConfirmacionEstado,
  consultaConfirmacionLabel,
  consultaConfirmacionBorderColor,
} from '../utils/sessionDisplay';

function athleteSearchText(a) {
  return `${a?.nombre || ''} ${a?.apellido || ''} ${a?.email || ''} ${a?.dni || ''}`.trim();
}

function matchesAthleteQuery(a, q) {
  if (!q) return true;
  const hay = athleteSearchText(a).toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

export default function StaffConsultAgendaCard({
  item,
  theme,
  colorMarca,
  navigation,
  sessionLabel,
  onUpdated,
}) {
  const { clubData } = useContext(ClubContext);
  const confirmEstado = consultaConfirmacionEstado(item);
  const confirmTxt = confirmEstado ? consultaConfirmacionLabel(confirmEstado) : 'Pendiente de confirmación';
  const borderAccent = consultaConfirmacionBorderColor(confirmEstado);
  const isRejected = confirmEstado === 'rechazada';

  const an = item.atletaIndividual;
  const nombreAtleta =
    an && typeof an === 'object' ? `${an.nombre || ''} ${an.apellido || ''}`.trim() : 'Atleta';
  const lugar = (item.lugarLibre || '').trim() || 'Sin lugar indicado';
  const catId = item.categoria?._id || item.categoria;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [athletes, setAthletes] = useState([]);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [savingAthlete, setSavingAthlete] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const showAlert = (title, message, opts = {}) => {
    const { showCancel = false, isDanger = false, onConfirm, onCancel } = opts;
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel,
      isDanger,
      confirmText: opts.confirmText || 'Aceptar',
      onConfirm: () => {
        closeAlert();
        onConfirm?.();
      },
      onCancel: () => {
        closeAlert();
        onCancel?.();
      },
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const openChangeAthlete = async () => {
    if (!catId) return;
    setPickerOpen(true);
    setAthleteQuery('');
    setLoadingAthletes(true);
    try {
      const h = await headers();
      const { data } = await clubApi.get(`/enrollments/categoria/${catId}`, { headers: h });
      setAthletes((data || []).map((e) => e.atleta).filter(Boolean));
    } catch (e) {
      setPickerOpen(false);
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los atletas.');
    } finally {
      setLoadingAthletes(false);
    }
  };

  const pickAthlete = async (athleteId) => {
    if (!athleteId || savingAthlete) return;
    setSavingAthlete(true);
    try {
      const h = await headers();
      await clubApi.patch(
        `/sessions/${item._id}/cambiar-atleta`,
        { nuevoAtletaId: athleteId },
        { headers: h },
      );
      setPickerOpen(false);
      setAthleteQuery('');
      await onUpdated?.();
      showAlert('Listo', 'Se asignó otro atleta y se volvió a pedir confirmación.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cambiar el atleta.');
    } finally {
      setSavingAthlete(false);
    }
  };

  const confirmCancel = () => {
    showAlert('Cancelar consulta', '¿Cancelamos esta consulta? Después vas a poder avisar al atleta con un comunicado.', {
      showCancel: true,
      isDanger: true,
      confirmText: 'Continuar',
      onConfirm: () => navigation.navigate('CoachCancelSession', { sessionId: item._id, session: item }),
    });
  };

  const filteredAthletes = useMemo(() => {
    const q = athleteQuery.trim().toLowerCase();
    return athletes.filter((a) => matchesAthleteQuery(a, q));
  }, [athletes, athleteQuery]);

  const closePicker = () => {
    setPickerOpen(false);
    setAthleteQuery('');
  };

  return (
    <>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: borderAccent || theme.border,
            borderWidth: borderAccent ? 2 : 1,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.mainRow}
          onPress={() => navigation.navigate('CoachSessionDetail', { sessionId: item._id })}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.dot,
              {
                backgroundColor:
                  confirmEstado === 'confirmada'
                    ? '#22c55e'
                    : confirmEstado === 'rechazada'
                      ? '#ef4444'
                      : item.estado === 'completada'
                        ? '#22c55e'
                        : colorMarca,
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{sessionLabel(item)}</Text>
            <Text style={[styles.rowSub, { color: theme.textMuted }]}>
              {item.horaInicio}–{item.horaFin} · {nombreAtleta}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
              {lugar} · {item.categoria?.nombre || ''} ·{' '}
              {item.estado === 'completada' ? 'Realizada' : 'Programada'} · {confirmTxt}
            </Text>
            {isRejected && item.confirmacionAtleta?.motivoRechazo ? (
              <Text style={[styles.rejectReason, { color: '#ef4444' }]} numberOfLines={2}>
                Motivo: {item.confirmacionAtleta.motivoRechazo}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.icon} />
        </TouchableOpacity>

        {isRejected ? (
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme.border }]}
              onPress={openChangeAthlete}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color={theme.text} />
              <Text style={[styles.actionTxt, { color: theme.text }]}>Cambiar atleta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnDanger]} onPress={confirmCancel}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.actionTxtDanger}>Eliminar sesión</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={closePicker}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHead, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Elegir atleta</Text>
              <TouchableOpacity onPress={closePicker} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.icon} />
              </TouchableOpacity>
            </View>
            {loadingAthletes ? (
              <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <View style={styles.searchWrap}>
                  <View
                    style={[
                      styles.searchRow,
                      { backgroundColor: theme.background, borderColor: theme.border },
                    ]}
                  >
                    <Ionicons name="search-outline" size={20} color={theme.textMuted} />
                    <TextInput
                      style={[
                        styles.searchInput,
                        { color: theme.text },
                        Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
                      ]}
                      placeholder="Buscar por nombre, apellido o DNI…"
                      placeholderTextColor={theme.textMuted}
                      value={athleteQuery}
                      onChangeText={setAthleteQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {athleteQuery ? (
                      <TouchableOpacity onPress={() => setAthleteQuery('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                  {filteredAthletes.length === 0 ? (
                    <Text style={[styles.emptySearch, { color: theme.textMuted }]}>
                      {athletes.length === 0
                        ? 'No hay atletas en esta categoría.'
                        : 'Ningún atleta coincide con la búsqueda.'}
                    </Text>
                  ) : (
                    filteredAthletes.map((a) => {
                  const selected = String(a._id) === String(an?._id || an);
                  return (
                    <TouchableOpacity
                      key={String(a._id)}
                      style={[
                        styles.athleteRow,
                        { borderBottomColor: theme.border },
                        selected && { opacity: 0.45 },
                      ]}
                      disabled={selected || savingAthlete}
                      onPress={() => pickAthlete(a._id)}
                    >
                      <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                        {a.apellido} {a.nombre}
                      </Text>
                      {savingAthlete ? (
                        <ActivityIndicator color={colorMarca} size="small" />
                      ) : selected ? (
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Actual</Text>
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                      )}
                    </TouchableOpacity>
                  );
                    })
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText || 'Aceptar'}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  rowSub: { fontSize: 14, marginTop: 4 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  rejectReason: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  actionTxt: { fontSize: 13, fontWeight: '700' },
  actionTxtDanger: { fontSize: 13, fontWeight: '700', color: '#fff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  emptySearch: {
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    fontSize: 14,
    lineHeight: 20,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
