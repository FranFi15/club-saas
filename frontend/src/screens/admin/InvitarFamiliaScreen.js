import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Share,
  Platform,
  Switch,
  TextInput,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { copyText } from '../../utils/copyText';
import CustomAlert from '../../components/CustomAlert';
import BusyOverlay from '../../components/BusyOverlay';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import SearchableDropdown from '../../components/SearchableDropdown';
import { sortByNombre } from '../../utils/listSort';
import { canMutateAsAdmin } from '../../constants/appRoles';

function emptySlot() {
  return { disciplina: '', categoria: '' };
}

export default function InvitarFamiliaScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [viewerRol, setViewerRol] = useState('');
  const canCreateInvite = canMutateAsAdmin(viewerRol);

  const [disciplines, setDisciplines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [slots, setSlots] = useState([emptySlot(), emptySlot()]);
  const [includeTutor, setIncludeTutor] = useState(true);
  const [tutorCount, setTutorCount] = useState(1);
  const [esPrueba, setEsPrueba] = useState(false);
  const [diasPrueba, setDiasPrueba] = useState('15');
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [recent, setRecent] = useState([]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    confirmText: 'OK',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: !!options.showCancel,
      isDanger: !!options.isDanger,
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: options.onCancel || closeAlert,
    });
  };

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const loadMeta = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    setLoadingMeta(true);
    try {
      const h = await getHeaders();
      const [discRes, catRes, invRes] = await Promise.all([
        clubApi.get('/disciplines', { headers: h }),
        clubApi.get('/categories', { headers: h }),
        clubApi.get('/family-invites', { headers: h }).catch(() => ({ data: [] })),
      ]);
      setDisciplines(sortByNombre(discRes.data || []));
      setCategories(sortByNombre(catRes.data || []));
      setRecent(Array.isArray(invRes.data) ? invRes.data.slice(0, 8) : []);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar disciplinas y categorías.');
    } finally {
      setLoadingMeta(false);
    }
  }, [clubData?.urlIdentifier]);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const disciplineOptions = useMemo(
    () => disciplines.map((d) => ({ label: d.nombre, value: d._id })),
    [disciplines],
  );

  const categoriesFor = (disciplinaId) =>
    categories
      .filter((c) => String(c.disciplina?._id || c.disciplina) === String(disciplinaId))
      .map((c) => {
        const age =
          c.edadMinima || c.edadMaxima
            ? ` (${c.edadMinima ?? '?'}–${c.edadMaxima ?? '?'} años)`
            : '';
        return { label: `${c.nombre}${age}`, value: c._id };
      });

  const updateSlot = (index, patch) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSlot = () => {
    if (slots.length >= 10) return showAlert('Límite', 'Máximo 10 atletas por invitación.');
    setSlots((prev) => [...prev, emptySlot()]);
  };

  const removeSlot = (index) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    for (let i = 0; i < slots.length; i += 1) {
      if (!slots[i].disciplina || !slots[i].categoria) {
        return showAlert('Faltan datos', `Completá disciplina y categoría del atleta ${i + 1}.`);
      }
    }
    if (esPrueba) {
      const days = Math.floor(Number(diasPrueba));
      if (!days || days < 1 || days > 365) {
        return showAlert('Días de prueba', 'Indicá entre 1 y 365 días de prueba.');
      }
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post(
        '/family-invites',
        {
          tutorCount: includeTutor ? tutorCount : 0,
          includeTutor,
          athleteSlots: slots.map((s) => ({ categoria: s.categoria })),
          esPrueba: !!esPrueba,
          diasPrueba: esPrueba ? Math.floor(Number(diasPrueba)) : undefined,
        },
        { headers: h },
      );
      setCreated(data);
      await loadMeta();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear la invitación.');
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = async (url) => {
    const tutors = created?.tutorCount ?? (includeTutor ? tutorCount : 0);
    const who = tutors > 1 ? 'familia' : tutors > 0 ? 'familia' : 'alta';
    try {
      await Share.share({
        message: `Hola! Completá el ${who} en ${clubData?.nombre || 'el club'}:\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
      });
    } catch {
      /* cancelled */
    }
  };

  const copyUrl = async (url) => {
    await copyText(url);
    showAlert('Listo', 'Enlace copiado. Podés mandarlo por WhatsApp.');
  };

  const handleDeleteRecent = (inv) => {
    if (!canCreateInvite) return;
    const label =
      inv.requiereTutor === false
        ? `solo atleta · ${inv.athleteCount} atleta${inv.athleteCount === 1 ? '' : 's'}`
        : `familia · ${inv.athleteCount} atleta${inv.athleteCount === 1 ? '' : 's'}`;
    showAlert(
      'Eliminar invitación',
      `¿Querés sacar esta invitación de recientes (${label}, ${inv.estado})? El enlace dejará de funcionar si aún estaba pendiente.`,
      {
        showCancel: true,
        isDanger: true,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          closeAlert();
          try {
            const h = await getHeaders();
            await clubApi.delete(`/family-invites/${inv._id}`, { headers: h });
            setRecent((prev) => prev.filter((r) => r._id !== inv._id));
            if (created?._id && String(created._id) === String(inv._id)) setCreated(null);
          } catch (e) {
            showAlert('Error', e.response?.data?.message || 'No se pudo eliminar la invitación.');
          }
        },
      },
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Usuarios"
        title="Invitar familia"
        subtitle={clubData?.nombre || 'Tu club'}
        onBack={() => navigation.goBack()}
      />

      {loadingMeta ? (
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!canCreateInvite ? (
            <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
              Solo lectura: podés ver invitaciones recientes. Un administrador genera nuevos enlaces.
            </Text>
          ) : null}
          {canCreateInvite && created?.url ? (
            <View style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.resultTitle, { color: theme.text }]}>Enlace listo</Text>
              <Text style={[styles.resultHint, { color: theme.textMuted }]}>
                Enviáselo {(created.tutorCount ?? 0) > 1 ? 'a los tutores' : (created.tutorCount ?? 0) > 0 ? 'al tutor' : 'al atleta'}. Vence el{' '}
                {created.expiresAt
                  ? new Date(created.expiresAt).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
                .
              </Text>
              <Text style={[styles.urlText, { color: colorMarca }]} selectable>
                {created.url}
              </Text>
              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colorMarca }]}
                  onPress={() => copyUrl(created.url)}
                >
                  <Ionicons name="copy-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Copiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }]}
                  onPress={() => shareUrl(created.url)}
                >
                  <Ionicons name="share-outline" size={18} color={theme.text} />
                  <Text style={[styles.actionBtnText, { color: theme.text }]}>Compartir</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCreated(null);
                  setIncludeTutor(true);
                  setTutorCount(1);
                  setEsPrueba(false);
                  setDiasPrueba('15');
                  setSlots([emptySlot(), emptySlot()]);
                }}
                style={{ marginTop: 12 }}
              >
                <Text style={{ color: colorMarca, fontWeight: '600', textAlign: 'center' }}>
                  Crear otra invitación
                </Text>
              </TouchableOpacity>
            </View>
          ) : canCreateInvite ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Tipo de alta</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: includeTutor ? colorMarca : theme.surface,
                      borderColor: includeTutor ? colorMarca : theme.border,
                    },
                  ]}
                  onPress={() => {
                    setIncludeTutor(true);
                    setTutorCount((n) => (n > 0 ? n : 1));
                    if (slots.length < 2) setSlots([emptySlot(), emptySlot()]);
                  }}
                >
                  <Text style={[styles.modeChipText, { color: includeTutor ? '#fff' : theme.text }]}>
                    Familia (con tutor)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: !includeTutor ? colorMarca : theme.surface,
                      borderColor: !includeTutor ? colorMarca : theme.border,
                    },
                  ]}
                  onPress={() => {
                    setIncludeTutor(false);
                    setTutorCount(0);
                    setSlots([emptySlot()]);
                  }}
                >
                  <Text style={[styles.modeChipText, { color: !includeTutor ? '#fff' : theme.text }]}>
                    Solo atleta
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.slotCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 4,
                  },
                ]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.slotTitle, { color: theme.text }]}>Atletas de prueba</Text>
                  <Text style={[styles.sectionHint, { color: theme.textMuted, marginBottom: 0 }]}>
                    Se inscriben a categoría/plan sin generar cuotas hasta confirmar.
                  </Text>
                </View>
                <Switch
                  value={esPrueba}
                  onValueChange={setEsPrueba}
                  trackColor={{ false: theme.border, true: colorMarca + '88' }}
                  thumbColor={esPrueba ? colorMarca : theme.textMuted}
                />
              </View>
              {esPrueba ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.sectionHint, { color: theme.textMuted, marginBottom: 6 }]}>
                    Días de prueba
                  </Text>
                  <TextInput
                    style={{
                      height: 48,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      color: theme.text,
                      backgroundColor: theme.surface,
                    }}
                    placeholder="15"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    value={diasPrueba}
                    onChangeText={(v) => setDiasPrueba(v.replace(/[^\d]/g, '').slice(0, 3))}
                    maxLength={3}
                  />
                </View>
              ) : null}

              {includeTutor ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.text }]}>Tutores a registrar</Text>
                  <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                    Todos los tutores quedan vinculados a los mismos atletas y ven la misma información.
                  </Text>
                  <View style={[styles.slotCard, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={[styles.slotTitle, { color: theme.text, flex: 1 }]}>
                      {tutorCount} tutor{tutorCount === 1 ? '' : 'es'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setTutorCount((n) => Math.max(1, n - 1))}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="remove-circle-outline" size={26} color={colorMarca} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setTutorCount((n) => Math.min(2, n + 1))}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="add-circle-outline" size={26} color={colorMarca} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                {slots.length > 1 ? 'Atletas a registrar' : 'Atleta a registrar'}
              </Text>
              <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                {includeTutor
                  ? 'Elegí disciplina y categoría de cada hijo. El tutor completa nombres y datos de contacto.'
                  : 'Para mayores sin tutor: el atleta completa su propio alta e inicia sesión con su email.'}
              </Text>

              {slots.map((slot, index) => (
                <View
                  key={`slot-${index}`}
                  style={[styles.slotCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.slotHeader}>
                    <Text style={[styles.slotTitle, { color: theme.text }]}>Atleta {index + 1}</Text>
                    {slots.length > 1 ? (
                      <TouchableOpacity onPress={() => removeSlot(index)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <SearchableDropdown
                    data={disciplineOptions}
                    value={slot.disciplina}
                    onChange={(val) => updateSlot(index, { disciplina: val, categoria: '' })}
                    placeholder="Disciplina"
                    theme={theme}
                    colorMarca={colorMarca}
                    compact
                    borderRadius={5}
                    inputHeight={48}
                  />
                  <View style={{ height: 10 }} />
                  <SearchableDropdown
                    data={categoriesFor(slot.disciplina)}
                    value={slot.categoria}
                    onChange={(val) => updateSlot(index, { categoria: val })}
                    placeholder={slot.disciplina ? 'Categoría' : 'Elegí disciplina primero'}
                    theme={theme}
                    colorMarca={colorMarca}
                    compact
                    borderRadius={5}
                    inputHeight={48}
                  />
                </View>
              ))}

              <TouchableOpacity style={styles.addRow} onPress={addSlot}>
                <Ionicons name="add-circle-outline" size={22} color={colorMarca} />
                <Text style={[styles.addRowText, { color: colorMarca }]}>Agregar atleta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                onPress={handleCreate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Generar enlace</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {recent.length > 0 ? (
            <View style={{ marginTop: 28 }}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Recientes</Text>
              {recent.map((inv) => (
                <View
                  key={inv._id}
                  style={[styles.recentRow, { borderBottomColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recentTitle, { color: theme.text }]}>
                      {inv.requiereTutor === false ? 'Solo atleta' : 'Familia'}
                      {(inv.tutorCount || 0) > 0 ? ` · ${inv.tutorCount} tutor${inv.tutorCount === 1 ? '' : 'es'}` : ''}
                      {' · '}{inv.athleteCount} atleta{inv.athleteCount === 1 ? '' : 's'} · {inv.estado}
                      {inv.expired ? ' (vencida)' : ''}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={2}>
                      {(inv.slots || []).map((s) => `${s.disciplina || '?'} / ${s.categoria || '?'}`).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {inv.url ? (
                      <TouchableOpacity onPress={() => copyUrl(inv.url)} hitSlop={8}>
                        <Ionicons name="copy-outline" size={20} color={colorMarca} />
                      </TouchableOpacity>
                    ) : null}
                    {canCreateInvite ? (
                      <TouchableOpacity onPress={() => handleDeleteRecent(inv)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <BusyOverlay
        visible={saving}
        title="Generando enlace de invitación…"
        theme={theme}
        color={colorMarca}
      />

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  sectionLabel: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  sectionHint: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  modeChipText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  slotCard: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 14,
    marginBottom: 12,
  },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  slotTitle: { fontSize: 15, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18, marginTop: 4 },
  addRowText: { fontSize: 15, fontWeight: '600' },
  createBtn: {
    height: 52,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resultCard: { borderWidth: 1, borderRadius: 5, padding: 16 },
  resultTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  resultHint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  urlText: { fontSize: 13, marginBottom: 14 },
  resultActions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnText: { color: '#fff', fontWeight: '700' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2, textTransform: 'capitalize' },
});
