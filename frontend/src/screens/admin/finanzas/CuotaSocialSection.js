import React, { useCallback, useContext, useState, useEffect } from 'react';
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
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { finanzasStyles as s } from './finanzasStyles';
import { fmtMoney, contrastOutlineBtn } from './finanzasConstants';
import DesignCard from '../../../components/DesignCard';
import { ThemeContext } from '../../../context/ThemeContext';
import { sortUsersByName } from '../../../utils/listSort';

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
  if (!Array.isArray(roles) || !roles.length) return 'Sin auto-asignación';
  return ROLES_APLICABLES.filter((r) => roles.includes(r.value))
    .map((r) => r.label)
    .join(' · ');
}

function feeRoles(fee) {
  if (Array.isArray(fee?.rolesAutoAsignacion) && fee.rolesAutoAsignacion.length) {
    return fee.rolesAutoAsignacion;
  }
  if (Array.isArray(fee?.rolesAplicables) && fee.rolesAplicables.length) {
    return fee.rolesAplicables;
  }
  return [];
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
  const { isDarkMode } = useContext(ThemeContext);
  const cc = primaryColor;
  const cacheKey = clubData?.urlIdentifier ? `finanzas-cuota-social-v2:${clubData.urlIdentifier}` : '';

  const [fees, setFees] = useState(() => readScreenCache(cacheKey)?.fees ?? []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [generating, setGenerating] = useState(false);

  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formDiaVenc, setFormDiaVenc] = useState('10');
  const [formRecargo, setFormRecargo] = useState('0');
  const [formRoles, setFormRoles] = useState([]);

  const [assignFee, setAssignFee] = useState(null);
  const [assignRole, setAssignRole] = useState('atleta');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignUsers, setAssignUsers] = useState([]);
  const [assignSelected, setAssignSelected] = useState(new Set());
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const applyFees = useCallback((data) => {
    setFees(data.fees ?? []);
  }, []);

  const fetchFees = useCallback(async () => {
    const headers = await getHeaders();
    const { data } = await clubApi.get('/financial/social-fees', { headers });
    return { fees: Array.isArray(data) ? data : [] };
  }, [getHeaders]);

  const { loading, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchFees,
    onFetched: applyFees,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las cuotas sociales.');
    },
  });

  const openCreate = () => {
    setEditingFee(null);
    setFormNombre('Cuota social');
    setFormDescripcion('');
    setFormMonto('');
    setFormDiaVenc('10');
    setFormRecargo('0');
    setFormRoles([]);
    setModalOpen(true);
  };

  const openEdit = (fee) => {
    setEditingFee(fee);
    setFormNombre(fee?.nombre || 'Cuota social');
    setFormDescripcion(fee?.descripcion || '');
    setFormMonto(fee?.monto != null ? String(fee.monto) : '');
    setFormDiaVenc(String(fee?.diaVencimiento ?? 10));
    setFormRecargo(String(fee?.porcentajeRecargo ?? 0));
    setFormRoles(feeRoles(fee));
    setModalOpen(true);
  };

  const toggleRol = (value) => {
    setFormRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
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

    const body = {
      nombre: formNombre.trim() || 'Cuota social',
      descripcion: formDescripcion.trim(),
      monto,
      diaVencimiento: dia,
      porcentajeRecargo: parseInt(formRecargo, 10) || 0,
      rolesAutoAsignacion: formRoles,
    };
    if (!editingFee?._id && monto > 0) {
      body.activo = true;
    }

    setSaving(true);
    try {
      const headers = await getHeaders();
      if (editingFee?._id) {
        await clubApi.patch(`/financial/social-fees/${editingFee._id}`, body, { headers });
      } else {
        await clubApi.post('/financial/social-fees', body, { headers });
      }
      setModalOpen(false);
      await reload();
      if (formRoles.length) {
        showAlert(
          'Listo',
          'Tipo guardado. Los roles elegidos se auto-asignaron a los usuarios no exentos de ese rol.',
        );
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el tipo de cuota social.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (fee, next) => {
    setTogglingId(fee._id);
    try {
      const headers = await getHeaders();
      await clubApi.patch(`/financial/social-fees/${fee._id}`, { activo: next }, { headers });
      await reload();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cambiar el estado.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (fee) => {
    showAlert('Eliminar tipo', `¿Eliminar "${fee.nombre || 'Cuota social'}"? Se desasignará de los usuarios que lo tengan.`, {
      showCancel: true,
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          const headers = await getHeaders();
          await clubApi.delete(`/financial/social-fees/${fee._id}`, { headers });
          showAlert('Listo', 'Tipo de cuota social eliminado.');
          await reload();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        }
      },
    });
  };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post('/financial/social-fees/generate', { mes, anio }, { headers });
      const stats = data?.estadisticas || {};
      showAlert(
        'Cuota social',
        stats.omitido
          ? stats.motivo || 'No hay cuotas para generar.'
          : `Se generaron ${stats.cuotasCreadas || 0} cuota(s) de ${MESES[(mes || 1) - 1]} ${anio}. Omitidas: ${stats.cuotasOmitidas || 0}.`,
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron generar las cuotas sociales.');
    } finally {
      setGenerating(false);
    }
  };

  const openAssign = (fee) => {
    setAssignFee(fee);
    setAssignRole('atleta');
    setAssignSearch('');
    setAssignUsers([]);
    setAssignSelected(new Set());
  };

  const searchAssignUsers = useCallback(async () => {
    if (!assignFee) return;
    setAssignLoading(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.get('/users', {
        headers,
        params: { rol: assignRole, search: assignSearch, limit: 40 },
      });
      const list = sortUsersByName(Array.isArray(data?.users) ? data.users : []);
      setAssignUsers(list);
    } catch {
      setAssignUsers([]);
    } finally {
      setAssignLoading(false);
    }
  }, [assignFee, assignRole, assignSearch, getHeaders]);

  useEffect(() => {
    if (!assignFee) return undefined;
    const t = setTimeout(() => {
      searchAssignUsers();
    }, 350);
    return () => clearTimeout(t);
  }, [assignFee, assignRole, assignSearch, searchAssignUsers]);

  const toggleAssignUser = (id) => {
    setAssignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setAssignSelected(new Set(assignUsers.map((u) => String(u._id))));
  };

  const saveAssign = async () => {
    if (!assignFee?._id || !assignSelected.size) {
      showAlert('Atención', 'Seleccioná al menos un usuario.');
      return;
    }
    setAssignSaving(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post(
        `/financial/social-fees/${assignFee._id}/assign`,
        { userIds: [...assignSelected] },
        { headers },
      );
      setAssignFee(null);
      showAlert('Listo', data?.message || 'Asignación guardada.');
      await reload();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo asignar.');
    } finally {
      setAssignSaving(false);
    }
  };

  const hasActiveFee = fees.some((f) => f.activo && Number(f.monto) > 0);

  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 4 }]}>Cuotas sociales</Text>
        <Text style={[s.sectionSub, { color: theme.textMuted, marginBottom: 0 }]}>
          Varios tipos. Cada persona tiene uno solo. Podés auto-asignar por rol o elegir usuarios.
        </Text>
      </View>

      <View style={styles.toolbar}>
        {canEdit ? (
          <TouchableOpacity
            style={[styles.toolbarBtn, contrastOutlineBtn(theme, isDarkMode)]}
            onPress={openCreate}
          >
            <Ionicons name="add" size={16} color={theme.text} />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Nuevo tipo</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.toolbarBtn,
            contrastOutlineBtn(theme, isDarkMode),
            { opacity: hasActiveFee ? 1 : 0.5 },
          ]}
          onPress={generateNow}
          disabled={!hasActiveFee || generating}
        >
          {generating ? (
            <ActivityIndicator color={theme.text} size="small" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={16} color={theme.text} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Generar mes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading && fees.length === 0 ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 16, marginBottom: 16 }} />
      ) : fees.length === 0 ? (
        <Text style={{ color: theme.textMuted, marginBottom: 16 }}>
          Todavía no hay tipos de cuota social. Creá el primero.
        </Text>
      ) : (
        fees.map((fee) => {
          const activo = fee.activo === true;
          const monto = Number(fee.monto) || 0;
          return (
            <DesignCard
              key={fee._id}
              theme={theme}
              isDarkMode={isDarkMode}
              accent={activo ? cc : '#ef4444'}
              muted={!activo}
              contentStyle={styles.cardInner}
              style={{ marginBottom: 10 }}
            >
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 },
                  ]}
                >
                  <Ionicons name="id-card-outline" size={22} color={theme.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                    {fee.nombre || 'Cuota social'}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Auto: {rolesLabel(feeRoles(fee))}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                    Vence día {fee.diaVencimiento ?? 10}
                    {(fee.porcentajeRecargo || 0) > 0 ? ` · +${fee.porcentajeRecargo}% mora` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.monto, { color: theme.text }]}>{fmtMoney(monto)}</Text>
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
                      {activo ? 'Activa' : 'Inactiva'}
                    </Text>
                  </View>
                </View>
              </View>

              {fee.descripcion ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>{fee.descripcion}</Text>
              ) : null}

              {canEdit ? (
                <>
                  <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                      Facturar este tipo
                    </Text>
                    {togglingId === fee._id ? (
                      <ActivityIndicator color={theme.text} />
                    ) : (
                      <Switch
                        value={activo}
                        onValueChange={(v) => toggleActivo(fee, v)}
                        trackColor={{ true: '#11111199', false: '#9ca3af55' }}
                        thumbColor={activo ? (isDarkMode ? '#fff' : '#111') : '#f4f4f5'}
                      />
                    )}
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, contrastOutlineBtn(theme, isDarkMode)]}
                      onPress={() => openEdit(fee)}
                    >
                      <Ionicons name="pencil-outline" size={16} color={theme.text} />
                      <Text style={[styles.actionTxt, { color: theme.text }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        contrastOutlineBtn(theme, isDarkMode),
                        { opacity: activo && monto > 0 ? 1 : 0.5 },
                      ]}
                      onPress={() => openAssign(fee)}
                      disabled={!activo || !(monto > 0)}
                    >
                      <Ionicons name="people-outline" size={16} color={theme.text} />
                      <Text style={[styles.actionTxt, { color: theme.text }]}>Asignar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, contrastOutlineBtn(theme, isDarkMode)]}
                      onPress={() => handleDelete(fee)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      <Text style={[styles.actionTxt, { color: '#ef4444' }]}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </DesignCard>
          );
        })
      )}

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '88%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text, flex: 1 }]}>
                {editingFee ? 'Editar tipo' : 'Nuevo tipo de cuota social'}
              </Text>
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
                placeholder="Cuota social atletas"
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

              <Text style={[styles.label, { color: theme.textMuted }]}>Auto-asignar a roles</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
                Al guardar, este tipo queda asignado a todos los no exentos de esos roles (y a los nuevos).
                Solo un tipo activo por rol.
              </Text>
              <View style={styles.rolesRow}>
                {ROLES_APLICABLES.map((r) => {
                  const sel = formRoles.includes(r.value);
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[
                        styles.rolPill,
                        contrastOutlineBtn(theme, isDarkMode),
                        sel && {
                          backgroundColor: isDarkMode ? '#ffffff' : '#111111',
                          borderColor: theme.text,
                        },
                      ]}
                      onPress={() => toggleRol(r.value)}
                    >
                      <Ionicons
                        name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={sel ? (isDarkMode ? '#111111' : '#ffffff') : theme.text}
                      />
                      <Text
                        style={{
                          color: sel ? (isDarkMode ? '#111111' : '#ffffff') : theme.text,
                          fontWeight: '600',
                        }}
                      >
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
                placeholder="Detalle"
                placeholderTextColor={theme.textMuted}
              />

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: isDarkMode ? '#ffffff' : '#111111',
                    opacity: saving ? 0.7 : 1,
                  },
                ]}
                onPress={save}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={isDarkMode ? '#111' : '#fff'} />
                ) : (
                  <Text style={[styles.saveTxt, { color: isDarkMode ? '#111111' : '#ffffff' }]}>
                    Guardar
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!assignFee} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                Asignar: {assignFee?.nombre || ''}
              </Text>
              <TouchableOpacity onPress={() => setAssignFee(null)} disabled={assignSaving}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <View style={styles.rolesRow}>
              {ROLES_APLICABLES.map((r) => {
                const sel = assignRole === r.value;
                return (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.rolPill,
                      contrastOutlineBtn(theme, isDarkMode),
                      sel && { backgroundColor: isDarkMode ? '#ffffff' : '#111111' },
                    ]}
                    onPress={() => setAssignRole(r.value)}
                  >
                    <Text
                      style={{
                        color: sel ? (isDarkMode ? '#111111' : '#ffffff') : theme.text,
                        fontWeight: '600',
                      }}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Ionicons name="search" size={18} color={theme.icon} style={{ marginLeft: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Buscar por nombre…"
                placeholderTextColor={theme.textMuted}
                value={assignSearch}
                onChangeText={setAssignSearch}
              />
              {assignLoading ? <ActivityIndicator color={theme.text} style={{ marginRight: 10 }} /> : null}
            </View>

            <View style={styles.assignActions}>
              <TouchableOpacity onPress={selectAllVisible}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Seleccionar visibles</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.textMuted }}>{assignSelected.size} seleccionados</Text>
            </View>

            <FlatList
              data={assignUsers}
              keyExtractor={(u) => String(u._id)}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
                  {assignLoading ? 'Buscando…' : 'Sin resultados'}
                </Text>
              }
              renderItem={({ item }) => {
                const id = String(item._id);
                const on = assignSelected.has(id);
                return (
                  <TouchableOpacity
                    style={[styles.userRow, { borderBottomColor: theme.border }]}
                    onPress={() => toggleAssignUser(id)}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={theme.text} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>
                        {item.nombre} {item.apellido}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{item.email}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor: isDarkMode ? '#ffffff' : '#111111',
                  opacity: assignSaving ? 0.7 : 1,
                  marginTop: 12,
                },
              ]}
              onPress={saveAssign}
              disabled={assignSaving}
            >
              {assignSaving ? (
                <ActivityIndicator color={isDarkMode ? '#111' : '#fff'} />
              ) : (
                <Text style={[styles.saveTxt, { color: isDarkMode ? '#111111' : '#ffffff' }]}>
                  Asignar a seleccionados
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHead: { marginBottom: 10 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardInner: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
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
  saveTxt: { fontWeight: '800', fontSize: 16 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 10,
  },
  searchInput: { flex: 1, height: '100%', paddingHorizontal: 10, fontSize: 15 },
  assignActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
