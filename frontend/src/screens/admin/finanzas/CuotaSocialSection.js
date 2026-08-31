import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { finanzasStyles as s } from './finanzasStyles';
import { fmtMoney } from './finanzasConstants';

const ROLES_APLICABLES = [
  { value: 'atleta', label: 'Atletas' },
  { value: 'tutor', label: 'Tutores' },
  { value: 'socio', label: 'Socios' },
];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function rolesLabel(roles) {
  if (!Array.isArray(roles) || !roles.length) return 'Sin alcance';
  return ROLES_APLICABLES.filter((r) => roles.includes(r.value))
    .map((r) => r.label)
    .join(' · ');
}

export default function CuotaSocialSection({
  clubData,
  theme,
  primaryColor,
  getHeaders,
  showAlert,
  mes,
  anio,
  canEdit = true,
}) {
  const cc = primaryColor;
  const cacheKey = clubData?.urlIdentifier ? `finanzas-cuota-social:${clubData.urlIdentifier}` : '';

  const [config, setConfig] = useState(() => readScreenCache(cacheKey)?.config ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingActivo, setTogglingActivo] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formDiaVenc, setFormDiaVenc] = useState('');
  const [formRecargo, setFormRecargo] = useState('');
  const [formRoles, setFormRoles] = useState(['atleta', 'tutor', 'socio']);

  const applyConfig = useCallback((data) => {
    setConfig(data.config);
  }, []);

  const fetchConfig = useCallback(async () => {
    const headers = await getHeaders();
    const { data } = await clubApi.get('/financial/social-fee', { headers });
    return { config: data };
  }, [getHeaders]);

  const { loading, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchConfig,
    onFetched: applyConfig,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la cuota social.');
    },
  });

  const openEdit = () => {
    setFormNombre(config?.nombre || 'Cuota social');
    setFormDescripcion(config?.descripcion || '');
    setFormMonto(config?.monto != null ? String(config.monto) : '');
    setFormDiaVenc(String(config?.diaVencimiento ?? 10));
    setFormRecargo(String(config?.porcentajeRecargo ?? 0));
    setFormRoles(
      Array.isArray(config?.rolesAplicables) && config.rolesAplicables.length
        ? config.rolesAplicables
        : ['atleta', 'tutor', 'socio'],
    );
    setModalOpen(true);
  };

  const toggleRol = (value) => {
    setFormRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  };

  const patchConfig = async (body) => {
    const headers = await getHeaders();
    const { data } = await clubApi.patch('/financial/social-fee', body, { headers });
    setConfig(data);
    await reload();
    return data;
  };

  const save = async () => {
    const monto = Number(String(formMonto).replace(',', '.'));
    if (Number.isNaN(monto) || monto < 0) {
      showAlert('Atención', 'Ingresá un monto válido.');
      return;
    }
    const dia = parseInt(formDiaVenc, 10);
    if (Number.isNaN(dia) || dia < 1 || dia > 28) {
      showAlert('Atención', 'El día de vencimiento debe estar entre 1 y 28.');
      return;
    }
    if (!formRoles.length) {
      showAlert('Atención', 'Elegí al menos un rol que pague la cuota social.');
      return;
    }

    setSaving(true);
    try {
      await patchConfig({
        nombre: formNombre.trim() || 'Cuota social',
        descripcion: formDescripcion.trim(),
        monto,
        diaVencimiento: dia,
        porcentajeRecargo: parseInt(formRecargo, 10) || 0,
        rolesAplicables: formRoles,
      });
      setModalOpen(false);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar la cuota social.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (next) => {
    setTogglingActivo(true);
    try {
      await patchConfig({ activo: next });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cambiar el estado.');
    } finally {
      setTogglingActivo(false);
    }
  };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post('/financial/social-fee/generate', { mes, anio }, { headers });
      const stats = data?.estadisticas || {};
      showAlert(
        'Cuota social',
        stats.omitido
          ? stats.motivo || 'La cuota social está desactivada.'
          : `Se generaron ${stats.cuotasCreadas || 0} cuota(s) de ${MESES[(mes || 1) - 1]} ${anio}. Omitidas: ${stats.cuotasOmitidas || 0}.`,
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron generar las cuotas sociales.');
    } finally {
      setGenerating(false);
    }
  };

  const activo = config?.activo === true;
  const monto = Number(config?.monto) || 0;

  return (
    <>
      <Text style={[s.sectionTitle, { color: theme.text }]}>Cuota social</Text>
      <Text style={[s.sectionSub, { color: theme.textMuted, marginBottom: 10 }]}>
        Una cuota del club independiente del plan de entrenamiento. Se factura todos los meses a los
        roles que elijas.
      </Text>

      {loading && !config ? (
        <ActivityIndicator color={cc} style={{ marginTop: 16, marginBottom: 16 }} />
      ) : (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: activo ? cc + '55' : theme.border },
          ]}
        >
          <View style={styles.cardTop}>
            <View style={[styles.icon, { backgroundColor: cc + '15' }]}>
              <Ionicons name="ribbon-outline" size={22} color={cc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {config?.nombre || 'Cuota social'}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                {rolesLabel(config?.rolesAplicables)}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                Vence día {config?.diaVencimiento ?? 10} de cada mes
                {(config?.porcentajeRecargo || 0) > 0
                  ? ` · +${config.porcentajeRecargo}% si vence`
                  : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.monto, { color: cc }]}>{fmtMoney(monto)}</Text>
              <View
                style={[
                  s.badge,
                  { backgroundColor: activo ? '#10b98120' : '#ef444420', marginTop: 4 },
                ]}
              >
                <Text
                  style={{
                    color: activo ? '#10b981' : '#ef4444',
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}
                >
                  {activo ? 'Activa' : 'Desactivada'}
                </Text>
              </View>
            </View>
          </View>

          {config?.descripcion ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
              {config.descripcion}
            </Text>
          ) : null}

          {canEdit ? (
            <>
              <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                  Facturar cuota social
                </Text>
                {togglingActivo ? (
                  <ActivityIndicator color={cc} />
                ) : (
                  <Switch
                    value={activo}
                    onValueChange={toggleActivo}
                    trackColor={{ true: cc + '99', false: '#9ca3af55' }}
                    thumbColor={activo ? cc : '#f4f4f5'}
                  />
                )}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.border }]}
                  onPress={openEdit}
                >
                  <Ionicons name="pencil-outline" size={16} color={cc} />
                  <Text style={[styles.actionTxt, { color: cc }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.border, opacity: activo ? 1 : 0.5 }]}
                  onPress={generateNow}
                  disabled={!activo || generating}
                >
                  {generating ? (
                    <ActivityIndicator color={cc} size="small" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={16} color={cc} />
                      <Text style={[styles.actionTxt, { color: cc }]}>Generar mes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      )}

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '88%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text, flex: 1 }]}>Editar cuota social</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} disabled={saving}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={formNombre}
                onChangeText={setFormNombre}
                placeholder="Cuota social"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Monto mensual</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={formMonto}
                onChangeText={setFormMonto}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Día de vencimiento (1–28)</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={formDiaVenc}
                onChangeText={setFormDiaVenc}
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Recargo por mora (%)</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={formRecargo}
                onChangeText={setFormRecargo}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Quiénes la pagan</Text>
              <View style={styles.rolesRow}>
                {ROLES_APLICABLES.map((r) => {
                  const sel = formRoles.includes(r.value);
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[
                        styles.rolPill,
                        {
                          borderColor: sel ? cc : theme.border,
                          backgroundColor: sel ? cc + '18' : 'transparent',
                        },
                      ]}
                      onPress={() => toggleRol(r.value)}
                    >
                      <Ionicons
                        name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={sel ? cc : theme.icon}
                      />
                      <Text style={{ color: sel ? cc : theme.textMuted, fontWeight: '600' }}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: theme.textMuted }]}>Descripción (opcional)</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { color: theme.text, borderColor: theme.border },
                ]}
                value={formDescripcion}
                onChangeText={setFormDescripcion}
                multiline
                placeholder="Detalle para los socios"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 14 }}>
                Los usuarios exceptuados desde su ficha no reciben esta cuota.
              </Text>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: cc, opacity: saving ? 0.7 : 1 }]}
                onPress={save}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveTxt}>Guardar cambios</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = {
  card: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 14,
    marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700' },
  monto: { fontSize: 18, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 10,
  },
  actionTxt: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    marginBottom: 10,
  },
  inputMultiline: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  rolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtn: {
    borderRadius: 5,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
};
