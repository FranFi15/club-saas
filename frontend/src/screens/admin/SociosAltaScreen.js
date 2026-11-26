import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Switch,
  StatusBar,
  RefreshControl,
  Image,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import ButtonDotsLoader from '../../components/ButtonDotsLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { copyText } from '../../utils/copyText';
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import DesignCard from '../../components/DesignCard';
import UserAvatar from '../../components/UserAvatar';
import { canMutateAsAdmin, isClubOwnerRole } from '../../constants/appRoles';
import { formatUserName, sortUsersByName } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const SEGMENTS = [
  { key: 'nuevos', label: 'Revisar nuevos' },
  { key: 'socios', label: 'Socios' },
];

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-AR')}`;
}

function personName(row) {
  if (row?.userId && typeof row.userId === 'object') {
    return formatUserName(row.userId);
  }
  return formatUserName({ nombre: row?.nombre, apellido: row?.apellido }) || row?.email || 'Socio';
}

function mesEstadoLabel(estado) {
  switch (estado) {
    case 'pagado':
      return { text: 'Al día', color: '#16a34a' };
    case 'pendiente':
      return { text: 'Pendiente', color: '#d97706' };
    case 'en_revision':
      return { text: 'En revisión', color: '#2563eb' };
    case 'vencido':
      return { text: 'Vencida', color: '#dc2626' };
    case 'exento':
      return { text: 'Exento', color: '#6b7280' };
    default:
      return { text: 'Sin cuota', color: '#6b7280' };
  }
}

function FinanceLines({ finance, theme }) {
  if (!finance) return null;
  const mes = mesEstadoLabel(finance.mesActual?.estado);
  const vencidas = finance.vencidas || { cantidad: 0, montoTotal: 0 };
  return (
    <View style={{ marginTop: 4, gap: 2 }}>
      <Text style={{ color: mes.color, fontSize: 12, fontWeight: '700' }}>
        Mes: {mes.text}
        {finance.mesActual?.monto ? ` · ${fmtMoney(finance.mesActual.monto)}` : ''}
      </Text>
      {vencidas.cantidad > 0 ? (
        <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>
          {vencidas.cantidad} vencida{vencidas.cantidad === 1 ? '' : 's'} · {fmtMoney(vencidas.montoTotal)}
        </Text>
      ) : (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Sin vencidas</Text>
      )}
    </View>
  );
}

export default function SociosAltaScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [viewerRol, setViewerRol] = useState('');
  const isOwner = isClubOwnerRole(viewerRol);
  const canReview = canMutateAsAdmin(viewerRol);

  const initialSegment =
    route?.params?.initialSegment === 'socios' ? 'socios' : 'nuevos';
  const [segment, setSegment] = useState(initialSegment);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  useEffect(() => {
    if (route?.params?.initialSegment === 'socios' || route?.params?.initialSegment === 'nuevos') {
      setSegment(route.params.initialSegment);
    }
  }, [route?.params?.initialSegment]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: !!options.showCancel,
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: options.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  };

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const [altaEnabled, setAltaEnabled] = useState(false);
  const [altaPublicUrl, setAltaPublicUrl] = useState('');
  const [altaFeeHint, setAltaFeeHint] = useState(null);
  const [altaLoading, setAltaLoading] = useState(false);
  const [altaSaving, setAltaSaving] = useState(false);

  const loadAltaSettings = useCallback(async () => {
    if (!isOwner || !clubData?.urlIdentifier) return;
    setAltaLoading(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.get('/socio-alta/settings', { headers });
      setAltaEnabled(data?.altaSocioPublicaEnabled === true);
      setAltaPublicUrl(data?.publicUrl || '');
      setAltaFeeHint(data?.fee || null);
    } catch {
      setAltaEnabled(false);
      setAltaPublicUrl('');
      setAltaFeeHint(null);
    } finally {
      setAltaLoading(false);
    }
  }, [getHeaders, isOwner, clubData?.urlIdentifier]);

  useEffect(() => {
    loadAltaSettings();
  }, [loadAltaSettings]);

  const toggleAltaPublica = async (next) => {
    if (!isOwner || altaSaving) return;
    const prev = altaEnabled;
    setAltaEnabled(next);
    setAltaSaving(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.patch(
        '/socio-alta/settings',
        { altaSocioPublicaEnabled: next },
        { headers },
      );
      setAltaEnabled(data?.altaSocioPublicaEnabled === true);
      setAltaPublicUrl(data?.publicUrl || '');
      setAltaFeeHint(data?.fee || null);
      showAlert(
        'Listo',
        data?.message ||
          (next ? 'Alta pública de socios activada.' : 'Alta pública de socios desactivada.'),
      );
    } catch (e) {
      setAltaEnabled(prev);
      showAlert('Error', e.response?.data?.message || 'No se pudo actualizar.');
    } finally {
      setAltaSaving(false);
    }
  };

  const nuevosCacheKey = clubData?.urlIdentifier
    ? `socio-alta-nuevos:${clubData.urlIdentifier}`
    : '';
  const [nuevos, setNuevos] = useState(() => readScreenCache(nuevosCacheKey) ?? []);
  const [reviewingId, setReviewingId] = useState(null);
  const [detailAlta, setDetailAlta] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [dniActionId, setDniActionId] = useState(null);

  const fetchNuevos = useCallback(async () => {
    const headers = await getHeaders();
    const { data } = await clubApi.get('/socio-alta/altas', {
      headers,
      params: { revisado: 'pendiente' },
    });
    return Array.isArray(data) ? data : [];
  }, [getHeaders]);

  const {
    loading: loadingNuevos,
    refreshing: refreshingNuevos,
    onRefresh: refreshNuevos,
  } = useCachedFocusLoad({
    cacheKey: nuevosCacheKey,
    enabled: !!nuevosCacheKey && canReview,
    fetchData: fetchNuevos,
    onFetched: setNuevos,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las altas nuevas.');
    },
  });

  const markRevisada = async (item) => {
    if (!canReview || !item?._id) return;
    setReviewingId(item._id);
    try {
      const headers = await getHeaders();
      await clubApi.patch(`/socio-alta/altas/${item._id}/revisar`, {}, { headers });
      setNuevos((prev) => prev.filter((r) => String(r._id) !== String(item._id)));
      setDetailAlta(null);
      showAlert('Listo', 'Alta marcada como revisada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo marcar como revisada.');
    } finally {
      setReviewingId(null);
    }
  };

  const sociosCacheKey = clubData?.urlIdentifier
    ? `socio-alta-socios-v2:${clubData.urlIdentifier}`
    : '';
  const [socios, setSocios] = useState(() => readScreenCache(sociosCacheKey)?.users ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchSocios = useCallback(async () => {
    const headers = await getHeaders();
    const { data } = await clubApi.get('/users', {
      headers,
      params: { rol: 'socio', limit: 100, page: 1 },
    });
    const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    return { users: sortUsersByName(users) };
  }, [getHeaders]);

  const {
    loading: loadingSocios,
    refreshing: refreshingSocios,
    onRefresh: refreshSocios,
  } = useCachedFocusLoad({
    cacheKey: sociosCacheKey,
    enabled: !!sociosCacheKey && canReview,
    fetchData: fetchSocios,
    onFetched: (data) => setSocios(data?.users ?? []),
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los socios.');
    },
  });

  const filteredSocios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return socios;
    return socios.filter((u) => {
      const hay = `${u.nombre || ''} ${u.apellido || ''} ${u.email || ''} ${u.dni || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [socios, searchQuery]);

  const highlightId = route?.params?.highlightId ? String(route.params.highlightId) : '';
  const highlightSocioId = route?.params?.highlightSocioId
    ? String(route.params.highlightSocioId)
    : '';

  useEffect(() => {
    if (!highlightId || !nuevos.length) return;
    const match = nuevos.find((r) => String(r._id) === highlightId);
    if (match) setDetailAlta(match);
  }, [highlightId, nuevos]);

  useEffect(() => {
    if (!highlightSocioId || !socios.length) return;
    const match = socios.find((u) => String(u._id) === highlightSocioId);
    if (match) {
      setSegment('socios');
      setSelectedUser(match);
    }
  }, [highlightSocioId, socios]);

  const solicitarDni = async (user, { reupload = false } = {}) => {
    if (!canReview || !user?._id) return;
    setDniActionId(user._id);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post(
        `/users/${user._id}/solicitar-dni`,
        {
          reupload,
          motivo: reupload
            ? 'El club necesita que vuelvas a cargar el frente y el dorso de tu DNI.'
            : 'El club necesita que cargues el frente y el dorso de tu DNI.',
        },
        { headers },
      );
      setSocios((prev) =>
        prev.map((u) =>
          String(u._id) === String(user._id)
            ? {
                ...u,
                dniSolicitado: true,
                dniSolicitudMotivo: data?.dniSolicitudMotivo || '',
              }
            : u,
        ),
      );
      setSelectedUser((prev) =>
        prev && String(prev._id) === String(user._id)
          ? {
              ...prev,
              dniSolicitado: true,
              dniSolicitudMotivo: data?.dniSolicitudMotivo || '',
            }
          : prev,
      );
      showAlert('Listo', data?.message || 'Solicitud enviada al socio.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo solicitar el DNI.');
    } finally {
      setDniActionId(null);
    }
  };

  const listData = segment === 'nuevos' ? nuevos : filteredSocios;
  const refreshing = segment === 'nuevos' ? refreshingNuevos : refreshingSocios;
  const onRefresh = segment === 'nuevos' ? refreshNuevos : refreshSocios;
  const showInitialLoader =
    (segment === 'nuevos' && loadingNuevos && nuevos.length === 0) ||
    (segment === 'socios' && loadingSocios && socios.length === 0);

  const renderNuevo = ({ item }) => {
    const pendingReview = !item.revisadoAt;
    const highlighted = highlightId && String(item._id) === highlightId;
    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={colorMarca}
        style={[styles.card, highlighted ? { borderColor: colorMarca, borderWidth: 1.5 } : null]}
        contentStyle={styles.cardRow}
        onPress={() => setDetailAlta(item)}
      >
        <UserAvatar
          user={item.userId && typeof item.userId === 'object' ? item.userId : item}
          size={44}
          colorMarca={colorMarca}
          style={styles.avatar}
        />
        <View style={styles.cardText}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {personName(item)}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={1}>
            {item.email}
          </Text>
          {pendingReview ? (
            <Text style={{ color: colorMarca, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              Pendiente de revisión
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.icon} />
      </DesignCard>
    );
  };

  const renderSocio = ({ item }) => {
    const hasDni = !!(item.tieneDniFrente && item.tieneDniDorso) || !!(item.dniFotoFrente && item.dniFotoDorso);
    const highlighted = highlightSocioId && String(item._id) === highlightSocioId;
    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={colorMarca}
        style={[styles.card, highlighted ? { borderColor: colorMarca, borderWidth: 1.5 } : null]}
        contentStyle={styles.cardRow}
        onPress={() => setSelectedUser(item)}
      >
        <UserAvatar user={item} size={44} colorMarca={colorMarca} style={styles.avatar} />
        <View style={styles.cardText}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {formatUserName(item)}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={1}>
            {item.email}
          </Text>
          <FinanceLines finance={item.finance} theme={theme} />
          {!hasDni ? (
            <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              Sin fotos de DNI
            </Text>
          ) : item.dniSolicitado ? (
            <Text style={{ color: '#d97706', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              Recarga de DNI pedida
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.icon} />
      </DesignCard>
    );
  };

  const listHeader = (
    <View>
      {isOwner ? (
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={colorMarca}
          contentStyle={{ paddingVertical: 12 }}
          style={{ marginBottom: 14 }}
        >
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                Alta pública de socios
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                Formulario web + pago de la primera cuota social. Requiere un tipo activo con
                auto-asignación a Socios y Mercado Pago.
              </Text>
              {altaFeeHint ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                  Cuota: {altaFeeHint.nombre} · {fmtMoney(altaFeeHint.monto)}
                </Text>
              ) : !altaLoading ? (
                <Text style={{ color: '#b45309', fontSize: 12, marginTop: 4 }}>
                  Falta un tipo de cuota social activo para el rol socio.
                </Text>
              ) : null}
            </View>
            <Switch
              value={altaEnabled}
              onValueChange={toggleAltaPublica}
              disabled={altaLoading || altaSaving}
              trackColor={{ false: theme.border, true: `${colorMarca}88` }}
              thumbColor={altaEnabled ? colorMarca : '#f4f3f4'}
            />
          </View>
          {altaEnabled && altaPublicUrl ? (
            <TouchableOpacity
              style={{ marginTop: 10 }}
              onPress={async () => {
                try {
                  await copyText(altaPublicUrl);
                  showAlert('Copiado', 'Enlace de alta pública copiado al portapapeles.');
                } catch {
                  showAlert('Enlace público', altaPublicUrl);
                }
              }}
            >
              <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                Copiar enlace: {altaPublicUrl}
              </Text>
            </TouchableOpacity>
          ) : null}
        </DesignCard>
      ) : null}

      <View style={[styles.segmentRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {SEGMENTS.map((s) => {
          const active = segment === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.segmentBtn, active ? { backgroundColor: colorMarca } : null]}
              onPress={() => setSegment(s.key)}
            >
              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 13 }}>
                {s.label}
                {s.key === 'nuevos' && nuevos.length ? ` (${nuevos.length})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'socios' ? (
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar socio..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.icon} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const emptyNuevos = (
    <View style={styles.empty}>
      <Ionicons name="checkmark-circle-outline" size={52} color={theme.icon} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin altas pendientes</Text>
      <Text style={[styles.emptySub, { color: theme.textMuted }]}>
        Cuando alguien complete el alta pública y el pago, vas a poder revisar sus datos acá.
      </Text>
    </View>
  );

  const emptySocios = (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={52} color={theme.icon} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No hay socios</Text>
      <Text style={[styles.emptySub, { color: theme.textMuted }]}>
        Los socios activos del club van a aparecer en este listado.
      </Text>
    </View>
  );

  const detailUser =
    detailAlta?.userId && typeof detailAlta.userId === 'object' ? detailAlta.userId : null;
  const frente = detailUser?.dniFotoFrente || detailAlta?.dniFotoFrente || '';
  const dorso = detailUser?.dniFotoDorso || detailAlta?.dniFotoDorso || '';

  const selectedFrente = selectedUser?.dniFotoFrente || '';
  const selectedDorso = selectedUser?.dniFotoDorso || '';
  const selectedHasDni = !!(selectedFrente && selectedDorso);
  const selectedUserIdForDni =
    selectedUser?._id ||
    (detailUser?._id ? detailUser._id : null) ||
    (detailAlta?.userId && typeof detailAlta.userId !== 'object' ? detailAlta.userId : null);

  const renderDniThumbs = (frenteUri, dorsoUri) => (
    <View style={styles.dniRow}>
      {frenteUri ? (
        <Pressable onPress={() => setPhotoPreview(frenteUri)} style={styles.dniThumbWrap}>
          <Image source={{ uri: frenteUri }} style={styles.dniThumb} />
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Frente</Text>
        </Pressable>
      ) : null}
      {dorsoUri ? (
        <Pressable onPress={() => setPhotoPreview(dorsoUri)} style={styles.dniThumbWrap}>
          <Image source={{ uri: dorsoUri }} style={styles.dniThumb} />
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Dorso</Text>
        </Pressable>
      ) : null}
      {!frenteUri && !dorsoUri ? (
        <Text style={{ color: theme.textMuted }}>Sin fotos de DNI.</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Estructura"
        title="Socios"
        subtitle="Alta pública y revisión de nuevos socios"
        sidebarRoot
        onBack={() => navigation.goBack()}
      />

      {showInitialLoader ? (
        <ClubSpinLoader size={56} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => String(item._id)}
          renderItem={segment === 'nuevos' ? renderNuevo : renderSocio}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={segment === 'nuevos' ? emptyNuevos : emptySocios}
        />
      )}

      {/* Detalle alta nueva */}
      <Modal
        visible={!!detailAlta}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailAlta(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                {detailAlta ? personName(detailAlta) : ''}
              </Text>
              <TouchableOpacity onPress={() => setDetailAlta(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {detailAlta ? (
              <>
                <Text style={{ color: theme.textMuted, marginBottom: 4 }}>{detailAlta.email}</Text>
                {detailAlta.dni ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 4 }}>DNI {detailAlta.dni}</Text>
                ) : null}
                {detailAlta.monto != null ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                    Primera cuota: {fmtMoney(detailAlta.monto)}
                  </Text>
                ) : null}

                <Text style={[styles.sectionLabel, { color: theme.text }]}>Documento</Text>
                {renderDniThumbs(frente, dorso)}

                {canReview && selectedUserIdForDni && (frente || dorso) ? (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colorMarca }]}
                    onPress={() =>
                      solicitarDni(
                        { _id: selectedUserIdForDni },
                        { reupload: true },
                      )
                    }
                    disabled={dniActionId === selectedUserIdForDni}
                  >
                    {dniActionId === selectedUserIdForDni ? (
                      <ButtonDotsLoader color={colorMarca} />
                    ) : (
                      <Text style={[styles.secondaryBtnText, { color: colorMarca }]}>
                        Pedir volver a cargar DNI
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {canReview ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colorMarca, marginTop: 10 }]}
                    onPress={() => markRevisada(detailAlta)}
                    disabled={reviewingId === detailAlta._id}
                  >
                    {reviewingId === detailAlta._id ? (
                      <ButtonDotsLoader color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Marcar como revisado</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Detalle socio */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                {selectedUser ? formatUserName(selectedUser) : ''}
              </Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {selectedUser ? (
              <>
                <Text style={{ color: theme.textMuted, marginBottom: 4 }}>{selectedUser.email}</Text>
                {selectedUser.dni ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 4 }}>
                    DNI {selectedUser.dni}
                  </Text>
                ) : null}
                {selectedUser.telefono ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 8 }}>
                    Tel. {selectedUser.telefono}
                  </Text>
                ) : null}

                <Text style={[styles.sectionLabel, { color: theme.text }]}>Finanzas</Text>
                <FinanceLines finance={selectedUser.finance} theme={theme} />

                <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 14 }]}>
                  Documento
                </Text>
                {renderDniThumbs(selectedFrente, selectedDorso)}

                {canReview ? (
                  !selectedHasDni ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
                      onPress={() => solicitarDni(selectedUser, { reupload: false })}
                      disabled={dniActionId === selectedUser._id}
                    >
                      {dniActionId === selectedUser._id ? (
                        <ButtonDotsLoader color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Solicitar DNI</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { borderColor: colorMarca }]}
                      onPress={() => solicitarDni(selectedUser, { reupload: true })}
                      disabled={dniActionId === selectedUser._id || selectedUser.dniSolicitado}
                    >
                      {dniActionId === selectedUser._id ? (
                        <ButtonDotsLoader color={colorMarca} />
                      ) : (
                        <Text style={[styles.secondaryBtnText, { color: colorMarca }]}>
                          {selectedUser.dniSolicitado
                            ? 'Ya se pidió volver a cargar'
                            : 'Volver a cargar DNI'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!photoPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPreview(null)}
      >
        <Pressable style={styles.photoBackdrop} onPress={() => setPhotoPreview(null)}>
          {photoPreview ? (
            <Image source={{ uri: photoPreview }} style={styles.photoFull} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  card: { marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  avatar: { marginRight: 12 },
  cardText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  sectionLabel: { fontWeight: '700', fontSize: 14, marginTop: 8, marginBottom: 8 },
  dniRow: { flexDirection: 'row', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  dniThumbWrap: { alignItems: 'center' },
  dniThumb: { width: 120, height: 80, borderRadius: 8, backgroundColor: '#00000022' },
  primaryBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontWeight: '800', fontSize: 15 },
  photoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoFull: { width: '100%', height: '80%' },
});
