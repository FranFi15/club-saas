import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import ClubSpinLoader from '../../../components/ClubSpinLoader';
import { Ionicons } from '@expo/vector-icons';
import FormSheet from '../../../components/FormSheet';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { useClientInfiniteScroll } from '../../../hooks/useClientInfiniteScroll';
import { finanzasStyles as s } from './finanzasStyles';
import { METODOS, MN, fmtMoney, contrastOutlineBtn } from './finanzasConstants';
import { pickImageAsset, pickAndUploadAttachment, openAttachmentUrl } from './finanzasUpload';
import { uploadFileToClub } from '../../../utils/uploadMedia';
import CustomAlert from '../../../components/CustomAlert';
import DesignCard from '../../../components/DesignCard';
import WebImageCropModal from '../../../components/WebImageCropModal';
import { ThemeContext } from '../../../context/ThemeContext';
import {
  useFinanzasCatalogColumns,
  finanzasCatalogStyles as cat,
  padCatalogData,
  isCatalogSpacer,
} from './finanzasCatalog';
import LoyaltyAdminPanel from '../../../components/LoyaltyAdminPanel';

const ROLE_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'atleta', label: 'Atletas' },
  { value: 'tutor', label: 'Tutores' },
  { value: 'socio', label: 'Socios' },
  { value: 'profe', label: 'Profesores' },
  { value: 'preparador_fisico', label: 'Prep. físico' },
  { value: 'psicologo', label: 'Psicólogos' },
  { value: 'nutricionista', label: 'Nutricionistas' },
  { value: 'colaborador', label: 'Colaboradores' },
  { value: 'control_ingreso', label: 'Control ingreso' },
  { value: 'administrativo', label: 'Administrativos' },
  { value: 'dirigente', label: 'Dirigentes' },
  { value: 'admin_club', label: 'Admin club' },
];

const ALL_CANJE_ROLES = ROLE_OPTIONS.filter((o) => o.value !== 'todos').map((o) => o.value);

function rolesHaveAll(selected, subset) {
  const set = new Set(Array.isArray(selected) ? selected : []);
  return subset.every((r) => set.has(r));
}

function roleChipOn(selected, value) {
  if (value === 'todos') return rolesHaveAll(selected, ALL_CANJE_ROLES);
  return (selected || []).includes(value);
}

function toggleRolesList(current, value) {
  const selected = Array.isArray(current) ? [...current] : [];
  if (value === 'todos') {
    return rolesHaveAll(selected, ALL_CANJE_ROLES) ? [] : [...ALL_CANJE_ROLES];
  }
  if (selected.includes(value)) return selected.filter((r) => r !== value);
  return [...selected, value];
}

function formatRolesCanjeLabel(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (!list.length) return 'Sin roles';
  if (rolesHaveAll(list, ALL_CANJE_ROLES)) return 'Todos';
  return (
    ALL_CANJE_ROLES.filter((r) => list.includes(r))
      .map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r)
      .join(' · ') || 'Sin roles'
  );
}

const FOTO_ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
];

function aspectRatioOf(value) {
  const found = FOTO_ASPECT_OPTIONS.find((o) => o.value === value);
  return found?.ratio || 16 / 9;
}

function aspectTupleOf(value) {
  const [a, b] = String(value || '16:9').split(':').map(Number);
  if (a > 0 && b > 0) return [a, b];
  return [16, 9];
}

const emptyDiscount = (withCredits = false) => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  titulo: '',
  fotoUrl: '',
  fotoAspect: '16:9',
  costoPuntos: withCredits ? '100' : '0',
  rolesCanje: ['atleta', 'tutor', 'socio'],
});

const APORTE_FREQ_OPTIONS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'anual', label: 'Anual' },
];

const emptyForm = () => ({
  nombre: '',
  fotoUrl: '',
  montoMensual: '',
  frecuenciaAporte: 'mensual',
  beneficios: '',
  rolesAplicables: [],
  cuotasSociales: [],
  usuariosPartner: '',
  partnerEmail: '',
  partnerPassword: '',
  discounts: [emptyDiscount()],
  activo: true,
});

function benefitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function SponsorsTab({
  clubData,
  theme,
  primaryColor,
  getHeaders,
  showAlert,
  mes,
  anio,
  canMutate = true,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const catalogColumns = useFinanzasCatalogColumns(false);
  const cc = primaryColor;
  const periodMes = mes || new Date().getMonth() + 1;
  const periodAnio = anio || new Date().getFullYear();
  const cacheKey = clubData?.urlIdentifier
    ? `finanzas-sponsors:${clubData.urlIdentifier}:${periodMes}-${periodAnio}`
    : '';

  const [sponsors, setSponsors] = useState(() => readScreenCache(cacheKey)?.sponsors ?? []);
  const [socialFees, setSocialFees] = useState(() => readScreenCache(cacheKey)?.socialFees ?? []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payMetodo, setPayMetodo] = useState('transferencia');
  const [payComprobante, setPayComprobante] = useState('');
  const [payNotas, setPayNotas] = useState('');
  const [payUploading, setPayUploading] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    isDanger: true,
    confirmText: 'Eliminar',
    onConfirm: () => {},
  });
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [uploadingDiscountKey, setUploadingDiscountKey] = useState(null);
  const [discountsSponsor, setDiscountsSponsor] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountDraft, setDiscountDraft] = useState(null);
  const [discountSaving, setDiscountSaving] = useState(false);
  /** { uri, aspect: [w,h], target: 'logo' | 'discount' | 'managed', key? } */
  const [cropJob, setCropJob] = useState(null);

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const [spRes, feeRes] = await Promise.all([
      clubApi.get('/financial/sponsors', {
        headers: h,
        params: { includeInactive: true, mes: periodMes, anio: periodAnio },
      }),
      clubApi.get('/financial/social-fees', { headers: h }).catch(() => ({ data: [] })),
    ]);
    const feesRaw = feeRes.data;
    return {
      sponsors: spRes.data?.sponsors || [],
      socialFees: Array.isArray(feesRaw) ? feesRaw : feesRaw?.fees || [],
    };
  }, [getHeaders, periodMes, periodAnio]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => {
      setSponsors(data.sponsors);
      setSocialFees(Array.isArray(data.socialFees) ? data.socialFees : []);
    },
    onFetchError: () => showAlert('Error', 'No se pudieron cargar los sponsors.'),
  });

  const sorted = useMemo(
    () =>
      [...sponsors].sort((a, b) => {
        if (a.activo === false && b.activo !== false) return 1;
        if (a.activo !== false && b.activo === false) return -1;
        const aPaid = a.pagoMes?.estado === 'pagado';
        const bPaid = b.pagoMes?.estado === 'pagado';
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
      }),
    [sponsors],
  );

  const {
    visibleItems,
    onEndReached,
    onEndReachedThreshold,
    ListFooterComponent,
  } = useClientInfiniteScroll(sorted, {
    pageSize: 20,
    colorMarca: cc,
    theme,
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item._id);
    setForm({
      ...emptyForm(),
      nombre: item.nombre || '',
      fotoUrl: item.fotoUrl || '',
      montoMensual: item.montoMensual != null ? String(item.montoMensual) : '',
      frecuenciaAporte: item.frecuenciaAporte === 'anual' ? 'anual' : 'mensual',
      beneficios: item.beneficios || '',
      rolesAplicables: Array.isArray(item.rolesAplicables) ? [...item.rolesAplicables] : [],
      cuotasSociales: (item.cuotasSociales || []).map((f) => String(f._id || f)),
      usuariosPartner: (item.usuariosPartner || []).map((u) => String(u._id || u)).join(', '),
      discounts: [],
      activo: item.activo !== false,
    });
    setFormOpen(true);
  };

  const updateDiscount = (key, patch) => {
    setForm((prev) => ({
      ...prev,
      discounts: (prev.discounts || []).map((d) => (d.key === key ? { ...d, ...patch } : d)),
    }));
  };

  const addDiscount = () => {
    setForm((prev) => ({
      ...prev,
      discounts: [...(prev.discounts || []), emptyDiscount(loyaltyEnabled)],
    }));
  };

  const removeDiscount = (key) => {
    setForm((prev) => ({
      ...prev,
      discounts: (prev.discounts || []).filter((d) => d.key !== key),
    }));
  };

  const toggleDiscountRole = (key, value) => {
    setForm((prev) => ({
      ...prev,
      discounts: (prev.discounts || []).map((d) => {
        if (d.key !== key) return d;
        return { ...d, rolesCanje: toggleRolesList(d.rolesCanje, value) };
      }),
    }));
  };

  const uploadDiscountPhoto = async (key) => {
    const discount = (form.discounts || []).find((d) => d.key === key);
    setUploadingDiscountKey(key);
    try {
      const picked = await pickImageAsset({ quality: 0.9 });
      if (!picked?.uri) return;
      setCropJob({
        uri: picked.uri,
        aspect: aspectTupleOf(discount?.fotoAspect),
        target: 'discount',
        key,
      });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo elegir la foto del descuento.');
    } finally {
      setUploadingDiscountKey(null);
    }
  };

  const loadSponsorDiscounts = useCallback(
    async (sponsorId) => {
      setDiscountsLoading(true);
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get('/loyalty/admin/rewards', {
          headers: h,
          params: { sponsor: sponsorId, includeInactive: '1' },
        });
        setDiscounts(Array.isArray(data?.rewards) ? data.rewards : []);
      } catch (e) {
        setDiscounts([]);
        showAlert('Descuentos', e.response?.data?.message || 'No se pudieron cargar los descuentos.');
      } finally {
        setDiscountsLoading(false);
      }
    },
    [getHeaders, showAlert],
  );

  const openDiscounts = (item) => {
    setDiscountsSponsor(item);
    setDiscountDraft(null);
    setDiscounts([]);
    loadSponsorDiscounts(item._id);
  };

  const closeDiscounts = () => {
    setDiscountsSponsor(null);
    setDiscountDraft(null);
    setDiscounts([]);
  };

  const startNewDiscountDraft = () => {
    setDiscountDraft({
      _id: null,
      titulo: '',
      fotoUrl: '',
      fotoAspect: '16:9',
      costoPuntos: loyaltyEnabled ? '100' : '0',
      rolesCanje: ['atleta', 'tutor', 'socio'],
      activo: true,
    });
  };

  const startEditDiscountDraft = (reward) => {
    setDiscountDraft({
      _id: reward._id,
      titulo: reward.titulo || '',
      fotoUrl: reward.fotoUrl || '',
      fotoAspect: reward.fotoAspect || '16:9',
      costoPuntos: String(reward.costoPuntos ?? 0),
      rolesCanje: Array.isArray(reward.rolesCanje) && reward.rolesCanje.length
        ? [...reward.rolesCanje]
        : ['atleta', 'tutor', 'socio'],
      activo: reward.activo !== false,
    });
  };

  const uploadManagedDiscountPhoto = async () => {
    if (!discountDraft) return;
    setUploadingDiscountKey('managed');
    try {
      const picked = await pickImageAsset({ quality: 0.9 });
      if (!picked?.uri) return;
      setCropJob({
        uri: picked.uri,
        aspect: aspectTupleOf(discountDraft.fotoAspect),
        target: 'managed',
      });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo elegir la foto.');
    } finally {
      setUploadingDiscountKey(null);
    }
  };

  const toggleManagedDiscountRole = (value) => {
    setDiscountDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, rolesCanje: toggleRolesList(prev.rolesCanje, value) };
    });
  };

  const saveManagedDiscount = async () => {
    if (!discountsSponsor?._id || !discountDraft) return;
    const titulo = String(discountDraft.titulo || '').trim();
    const costoPuntos = loyaltyEnabled
      ? Math.max(0, parseInt(discountDraft.costoPuntos, 10) || 0)
      : 0;
    const rolesCanje = Array.isArray(discountDraft.rolesCanje) ? discountDraft.rolesCanje : [];
    if (!titulo) {
      showAlert('Atención', 'El nombre del descuento es obligatorio.');
      return;
    }
    if (costoPuntos > 0 && !loyaltyEnabled) {
      showAlert('Atención', 'Activá Créditos del club para descuentos canjeables, o dejá créditos en 0.');
      return;
    }
    if (!rolesCanje.length) {
      showAlert('Atención', 'Elegí al menos un tipo de usuario.');
      return;
    }
    setDiscountSaving(true);
    try {
      const h = await getHeaders();
      const body = {
        titulo,
        fotoUrl: String(discountDraft.fotoUrl || '').trim(),
        fotoAspect: discountDraft.fotoAspect || '16:9',
        costoPuntos,
        rolesCanje,
        tipo: 'texto',
        valor: 0,
        activo: discountDraft.activo !== false,
      };
      if (discountDraft._id) {
        await clubApi.patch(`/loyalty/admin/rewards/${discountDraft._id}`, body, { headers: h });
        showAlert('Listo', 'Descuento actualizado.');
      } else {
        await clubApi.post(
          '/loyalty/admin/rewards',
          { ...body, sponsor: discountsSponsor._id },
          { headers: h },
        );
        showAlert('Listo', 'Descuento creado.');
      }
      setDiscountDraft(null);
      await loadSponsorDiscounts(discountsSponsor._id);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el descuento.');
    } finally {
      setDiscountSaving(false);
    }
  };

  const deactivateManagedDiscount = (reward) => {
    const sponsorId = discountsSponsor?._id;
    setConfirmCfg({
      visible: true,
      title: reward.activo === false ? 'Reactivar descuento' : 'Desactivar descuento',
      message:
        reward.activo === false
          ? `¿Reactivar "${reward.titulo}"?`
          : `¿Desactivar "${reward.titulo}"? Deja de mostrarse para canje.`,
      isDanger: reward.activo !== false,
      confirmText: reward.activo === false ? 'Reactivar' : 'Desactivar',
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          if (reward.activo === false) {
            await clubApi.patch(
              `/loyalty/admin/rewards/${reward._id}`,
              { activo: true },
              { headers: h },
            );
          } else {
            await clubApi.delete(`/loyalty/admin/rewards/${reward._id}`, { headers: h });
          }
          if (sponsorId) await loadSponsorDiscounts(sponsorId);
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo actualizar.');
        }
      },
    });
  };

  const toggleRole = (value) => {
    setForm((prev) => ({
      ...prev,
      rolesAplicables: toggleRolesList(prev.rolesAplicables, value),
    }));
  };

  const toggleFee = (id) => {
    const sid = String(id);
    setForm((prev) => {
      const has = prev.cuotasSociales.includes(sid);
      return {
        ...prev,
        cuotasSociales: has
          ? prev.cuotasSociales.filter((x) => x !== sid)
          : [...prev.cuotasSociales, sid],
      };
    });
  };

  const uploadPhoto = async () => {
    setUploading(true);
    try {
      const picked = await pickImageAsset({ quality: 0.9 });
      if (!picked?.uri) return;
      setCropJob({
        uri: picked.uri,
        aspect: [1, 1],
        target: 'logo',
      });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo elegir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const confirmCroppedSponsorImage = async (result) => {
    const job = cropJob;
    setCropJob(null);
    if (!job || !result) return;
    const isLogo = job.target === 'logo';
    const isManaged = job.target === 'managed';
    if (isLogo) setUploading(true);
    else setUploadingDiscountKey(isManaged ? 'managed' : job.key);
    try {
      let url;
      if (result?.uri && !result?.type) {
        const { url: uploaded } = await uploadFileToClub(
          clubData,
          result.uri,
          result.filename || `sponsor-${Date.now()}.jpg`,
          result.mime || 'image/jpeg',
        );
        url = uploaded;
      } else {
        const name = result?.name || `sponsor-${Date.now()}.jpg`;
        const mime = result?.type || 'image/jpeg';
        const { url: uploaded } = await uploadFileToClub(clubData, '', name, mime, { webFile: result });
        url = uploaded;
      }
      if (!url) return;
      if (isLogo) setForm((prev) => ({ ...prev, fotoUrl: url }));
      else if (isManaged) setDiscountDraft((p) => (p ? { ...p, fotoUrl: url } : p));
      else if (job.key) updateDiscount(job.key, { fotoUrl: url });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
      setUploadingDiscountKey(null);
    }
  };

  const saveForm = async () => {
    if (savingRef.current) return;
    if (!form.nombre.trim()) {
      showAlert('Atención', 'El nombre es obligatorio.');
      return;
    }

    const isCreate = !editingId;
    // Con créditos off: creación clásica (sin descuentos estructurados ni partner account).
    const rewards =
      isCreate && loyaltyEnabled
        ? (form.discounts || [])
            .map((d) => ({
              titulo: String(d.titulo || '').trim(),
              fotoUrl: String(d.fotoUrl || '').trim(),
              fotoAspect: d.fotoAspect || '16:9',
              costoPuntos: Math.max(0, parseInt(d.costoPuntos, 10) || 0),
              rolesCanje: Array.isArray(d.rolesCanje) ? d.rolesCanje : [],
              tipo: 'texto',
              valor: 0,
            }))
            .filter((d) => d.titulo)
        : [];
    const creditRewards = rewards.filter((r) => r.costoPuntos > 0);
    const wantsPartner =
      loyaltyEnabled &&
      (!!String(form.partnerEmail || '').trim() || !!String(form.partnerPassword || '').trim());

    if (wantsPartner) {
      if (!String(form.partnerEmail || '').trim() || !String(form.partnerPassword || '').trim()) {
        showAlert('Atención', 'Completá email y contraseña del partner.');
        return;
      }
      if (String(form.partnerPassword).length < 6) {
        showAlert('Atención', 'La contraseña del partner debe tener al menos 6 caracteres.');
        return;
      }
    }
    if (loyaltyEnabled && rewards.some((r) => !r.rolesCanje.length)) {
      showAlert('Atención', 'Cada descuento necesita al menos un tipo de usuario.');
      return;
    }
    if (!form.rolesAplicables.length && !form.cuotasSociales.length && !rewards.length) {
      showAlert(
        'Atención',
        loyaltyEnabled
          ? 'Seleccioná tipos de usuario/cuota o agregá un descuento.'
          : 'Seleccioná al menos un tipo de usuario o una cuota social.',
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const h = await getHeaders();
      const rolesFromRewards = [...new Set(rewards.flatMap((r) => r.rolesCanje))];
      const payload = {
        nombre: form.nombre.trim(),
        fotoUrl: form.fotoUrl.trim(),
        montoMensual: form.montoMensual === '' ? 0 : Number(String(form.montoMensual).replace(',', '.')),
        frecuenciaAporte: form.frecuenciaAporte === 'anual' ? 'anual' : 'mensual',
        beneficios: form.beneficios,
        rolesAplicables: form.rolesAplicables.length ? form.rolesAplicables : rolesFromRewards,
        cuotasSociales: form.cuotasSociales,
        activo: form.activo,
        mes: periodMes,
        anio: periodAnio,
      };
      if (wantsPartner) {
        payload.partnerEmail = String(form.partnerEmail).trim().toLowerCase();
        payload.partnerPassword = String(form.partnerPassword);
      }
      if (isCreate && loyaltyEnabled && rewards.length) {
        payload.rewards = rewards;
        if (creditRewards.length) {
          payload.rolesCanjeCreditos = rolesFromRewards;
        }
      }
      if (editingId) {
        await clubApi.patch(`/financial/sponsors/${editingId}`, payload, { headers: h });
        showAlert('Listo', 'Sponsor actualizado.');
      } else {
        const { data } = await clubApi.post('/financial/sponsors', payload, { headers: h });
        showAlert('Listo', data?.message || 'Sponsor creado.');
      }
      setFormOpen(false);
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el sponsor.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Eliminar sponsor',
      message: `¿Eliminar a ${item.nombre}? Esta acción no se puede deshacer.`,
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          await clubApi.delete(`/financial/sponsors/${item._id}`, { headers: h });
          showAlert('Listo', 'Sponsor eliminado.');
          reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        }
      },
    });
  };

  const openPay = (item) => {
    setPayTarget(item);
    setPayMetodo('transferencia');
    setPayComprobante(item.pagoMes?.comprobanteUrl || '');
    setPayNotas(item.pagoMes?.notas || '');
    setPayOpen(true);
  };

  const uploadPayComprobante = async () => {
    setPayUploading(true);
    try {
      const url = await pickAndUploadAttachment(clubData);
      if (url) setPayComprobante(url);
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir el comprobante.');
    } finally {
      setPayUploading(false);
    }
  };

  const savePay = async () => {
    if (!payTarget?._id) return;
    setSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.patch(
        `/financial/sponsors/${payTarget._id}/pay-month`,
        {
          mes: periodMes,
          anio: periodAnio,
          metodoPago: payMetodo,
          comprobanteUrl: payComprobante,
          notas: payNotas,
          monto: payTarget.pagoMes?.monto ?? payTarget.montoMensual,
        },
        { headers: h },
      );
      setPayOpen(false);
      showAlert('Listo', `Pago de ${MN[periodMes - 1]} ${periodAnio} confirmado.`);
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo confirmar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const revertPay = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Revertir pago',
      message: `¿Marcar el aporte de ${item.nombre} en ${MN[periodMes - 1]} ${periodAnio} como pendiente?`,
      isDanger: false,
      confirmText: 'Revertir',
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          await clubApi.patch(
            `/financial/sponsors/${item._id}/unpay-month`,
            { mes: periodMes, anio: periodAnio },
            { headers: h },
          );
          showAlert('Listo', 'Pago revertido a pendiente.');
          reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo revertir.');
        }
      },
    });
  };

  const catalogSponsors = useMemo(
    () => padCatalogData(visibleItems, catalogColumns),
    [visibleItems, catalogColumns],
  );

  const renderItem = ({ item }) => {
    if (isCatalogSpacer(item)) {
      return <View style={cat.cell} />;
    }
    const inactive = item.activo === false;
    const pago = item.pagoMes;
    const paid = pago?.estado === 'pagado';
    const expected = pago?.monto ?? item.montoMensual;
    const isAnnual = item.frecuenciaAporte === 'anual';
    const periodLabel = isAnnual ? `Año ${periodAnio}` : MN[periodMes - 1];

    const card = (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={inactive ? '#9ca3af' : paid ? '#10b981' : '#f59e0b'}
        muted={inactive}
        style={[
          catalogColumns > 1 ? cat.card3 : { marginBottom: 12 },
          { opacity: inactive ? 0.75 : 1 },
        ]}
        stretch={catalogColumns > 1}
        contentStyle={styles.cardInner}
      >
        <View style={styles.cardMain}>
          {item.fotoUrl ? (
            <Image source={{ uri: item.fotoUrl }} style={styles.logo} />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="ribbon-outline" size={22} color={theme.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{item.nombre}</Text>
            <Text style={{ color: cc, fontWeight: '700', marginTop: 4 }}>
              {fmtMoney(expected)} · {isAnnual ? 'Anual' : 'Mensual'} · {periodLabel}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: paid ? '#10b98118' : '#f59e0b18',
                  borderColor: paid ? '#10b981' : '#f59e0b',
                },
              ]}
            >
              <Text style={{ color: paid ? '#10b981' : '#f59e0b', fontSize: 11, fontWeight: '800' }}>
                {paid ? (isAnnual ? 'Pagado (año)' : 'Pagado') : isAnnual ? 'Pendiente (año)' : 'Pendiente'}
              </Text>
            </View>
            <View style={catalogColumns > 1 ? cat.metaSlot : undefined}>
              {inactive ? (
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Inactivo</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
            {loyaltyEnabled ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: cc, backgroundColor: `${cc}14` }]}
                onPress={() => openDiscounts(item)}
              >
                <Ionicons name="pricetags-outline" size={15} color={cc} />
                <Text style={[styles.actionTxt, { color: cc }]}>Descuentos</Text>
              </TouchableOpacity>
            ) : null}
            {canMutate ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => openEdit(item)}
              >
                <Ionicons name="pencil-outline" size={15} color={theme.text} />
                <Text style={[styles.actionTxt, { color: theme.text }]}>Editar</Text>
              </TouchableOpacity>
            ) : null}
            {canMutate && !paid ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }]}
                onPress={() => openPay(item)}
              >
                <Ionicons name="checkmark-circle-outline" size={15} color="#10b981" />
                <Text style={[styles.actionTxt, { color: '#10b981' }]}>Confirmar</Text>
              </TouchableOpacity>
            ) : null}
            {paid && pago?.comprobanteUrl ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={async () => {
                  try {
                    await openAttachmentUrl(pago.comprobanteUrl);
                  } catch (e) {
                    showAlert('Error', e.message || 'No se pudo abrir el comprobante.');
                  }
                }}
              >
                <Ionicons name="image-outline" size={15} color={theme.text} />
                <Text style={[styles.actionTxt, { color: theme.text }]}>Comprobante</Text>
              </TouchableOpacity>
            ) : null}
            {canMutate && paid ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}
                onPress={() => openPay(item)}
              >
                <Ionicons name="create-outline" size={15} color="#d97706" />
                <Text style={[styles.actionTxt, { color: '#d97706' }]}>Actualizar</Text>
              </TouchableOpacity>
            ) : null}
            {canMutate ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: '#ef4444', backgroundColor: '#ef4444' }]}
                onPress={() => confirmDelete(item)}
              >
                <Ionicons name="trash-outline" size={15} color="#fff" />
                <Text style={[styles.actionTxt, { color: '#fff' }]}>Eliminar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
      </DesignCard>
    );

    if (catalogColumns > 1) {
      return <View style={cat.cell}>{card}</View>;
    }
    return card;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
          {canMutate
            ? 'Confirmá el pago y adjuntá el comprobante'
            : 'Sponsors del club (solo lectura)'}
        </Text>
      </View>

      {loading && !sponsors.length ? (
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          key={catalogColumns > 1 ? 'sponsors-catalog' : 'sponsors-list'}
          data={catalogSponsors}
          keyExtractor={(item) => String(item._id)}
          numColumns={catalogColumns}
          columnWrapperStyle={catalogColumns > 1 ? cat.row : undefined}
          contentContainerStyle={{ padding: 16, paddingBottom: canMutate ? 100 : 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={onEndReachedThreshold}
          ListHeaderComponent={
            <LoyaltyAdminPanel
              theme={theme}
              colorMarca={cc}
              getHeaders={getHeaders}
              showAlert={showAlert}
              canMutate={canMutate}
              onEnabledChange={setLoyaltyEnabled}
            />
          }
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
              Todavía no hay sponsors. Agregá el primero.
            </Text>
          }
          renderItem={renderItem}
        />
      )}

      {canMutate ? (
        <TouchableOpacity style={[s.fab, { backgroundColor: cc }]} onPress={openCreate}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={payOpen} animationType="slide" transparent onRequestClose={() => setPayOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {payTarget?.pagoMes?.estado === 'pagado'
                  ? 'Actualizar pago'
                  : payTarget?.frecuenciaAporte === 'anual'
                    ? 'Confirmar aporte anual'
                    : 'Confirmar pago'}
              </Text>
              <TouchableOpacity onPress={() => setPayOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {payTarget ? (
                <View style={[s.payInfo, { backgroundColor: `${cc}14` }]}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{payTarget.nombre}</Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4 }}>
                    {payTarget?.frecuenciaAporte === 'anual'
                      ? `Aporte anual · ${periodAnio}`
                      : `${MN[periodMes - 1]} ${periodAnio}`}
                  </Text>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22, marginTop: 6 }}>
                    {fmtMoney(payTarget.pagoMes?.monto ?? payTarget.montoMensual)}
                  </Text>
                </View>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Método de pago</Text>
              <View style={styles.chipRow}>
                {METODOS.map((m) => {
                  const on = payMetodo === m.value;
                  return (
                    <TouchableOpacity
                      key={m.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? cc : theme.border,
                          backgroundColor: on ? cc + '22' : theme.background,
                        },
                      ]}
                      onPress={() => setPayMetodo(m.value)}
                    >
                      <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Comprobante (imagen o PDF)</Text>
              <TouchableOpacity
                onPress={uploadPayComprobante}
                disabled={payUploading}
                style={[
                  s.input,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  },
                ]}
              >
                <Text style={{ color: payComprobante ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                  {payUploading ? 'Subiendo…' : payComprobante ? 'Comprobante subido ✓' : 'Subir comprobante'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={20} color={cc} />
              </TouchableOpacity>
              {payComprobante ? (
                <TouchableOpacity onPress={() => setPayComprobante('')} style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar comprobante</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Notas</Text>
              <TextInput
                style={[
                  s.input,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background, minHeight: 70 },
                ]}
                multiline
                value={payNotas}
                onChangeText={setPayNotas}
                placeholderTextColor={theme.textMuted}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: '#10b981', opacity: saving ? 0.7 : 1 }]}
                onPress={savePay}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>
                    {payTarget?.pagoMes?.estado === 'pagado' ? 'Guardar cambios' : 'Confirmar pago'}
                  </Text>
                )}
              </TouchableOpacity>

              {payTarget?.pagoMes?.estado === 'pagado' ? (
                <TouchableOpacity
                  style={[
                    s.saveBtn,
                    {
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#f59e0b',
                      backgroundColor: '#fffbeb',
                    },
                  ]}
                  onPress={() => {
                    setPayOpen(false);
                    revertPay(payTarget);
                  }}
                  disabled={saving}
                >
                  <Text style={[s.saveBtnTxt, { color: '#d97706' }]}>Revertir a pendiente</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FormSheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar sponsor' : 'Nuevo sponsor'}
        theme={theme}
        isDarkMode={isDarkMode}
      >
              <TouchableOpacity style={styles.photoBtn} onPress={uploadPhoto} disabled={uploading}>
                {form.fotoUrl ? (
                  <Image source={{ uri: form.fotoUrl }} style={styles.photoPreview} />
                ) : (
                  <View style={[styles.photoPlaceholder, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    {uploading ? (
                      <ClubSpinLoader size={40} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={24} color={theme.textMuted} />
                        <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 12 }}>Foto / logo</Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              {form.fotoUrl ? (
                <TouchableOpacity onPress={() => setForm((p) => ({ ...p, fotoUrl: '' }))} style={{ alignSelf: 'center', marginBottom: 8 }}>
                  <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>Quitar foto</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Nombre</Text>
              <TextInput
                style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={form.nombre}
                onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))}
                placeholder="Nombre del sponsor"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Frecuencia del aporte</Text>
              <View style={styles.chipRow}>
                {APORTE_FREQ_OPTIONS.map((opt) => {
                  const on = (form.frecuenciaAporte || 'mensual') === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? cc : theme.border,
                          backgroundColor: on ? cc + '22' : theme.background,
                        },
                      ]}
                      onPress={() => setForm((p) => ({ ...p, frecuenciaAporte: opt.value }))}
                    >
                      <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>
                {form.frecuenciaAporte === 'anual' ? 'Aporte anual' : 'Aporte mensual'}
              </Text>
              <TextInput
                style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={form.montoMensual}
                onChangeText={(t) => setForm((p) => ({ ...p, montoMensual: t.replace(/[^0-9.,]/g, '') }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />
              {form.frecuenciaAporte === 'anual' ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10, marginTop: -4 }}>
                  Se controla una sola vez por año. No genera pendientes mensuales ni se suma a Caja cada mes.
                </Text>
              ) : null}

              {loyaltyEnabled && !editingId ? (
                <>
                  <Text style={[styles.blockTitle, { color: theme.text }]}>Cuenta partner (opcional)</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
                    Solo si el sponsor valida canjes con créditos. Podés omitirlo para beneficios libres.
                  </Text>
                  <Text style={[s.label, { color: theme.textMuted }]}>Email</Text>
                  <TextInput
                    style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={form.partnerEmail}
                    onChangeText={(t) => setForm((p) => ({ ...p, partnerEmail: t }))}
                    placeholder="partner@negocio.com"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Text style={[s.label, { color: theme.textMuted }]}>Contraseña</Text>
                  <TextInput
                    style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={form.partnerPassword}
                    onChangeText={(t) => setForm((p) => ({ ...p, partnerPassword: t }))}
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry
                  />

                  <Text style={[styles.blockTitle, { color: theme.text }]}>Descuentos</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
                    Créditos 0 = beneficio libre (sin canje). Con créditos = canjeable.
                  </Text>
                  {(form.discounts || []).map((d, idx) => (
                    <View
                      key={d.key}
                      style={[styles.discountCard, { borderColor: theme.border, backgroundColor: theme.background }]}
                    >
                      <View style={styles.discountHead}>
                        <Text style={{ color: theme.text, fontWeight: '800' }}>Descuento {idx + 1}</Text>
                        {(form.discounts || []).length > 1 ? (
                          <TouchableOpacity onPress={() => removeDiscount(d.key)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <Text style={[s.label, { color: theme.textMuted }]}>Aspecto de la imagen</Text>
                      <View style={styles.chipRow}>
                        {FOTO_ASPECT_OPTIONS.map((opt) => {
                          const on = (d.fotoAspect || '16:9') === opt.value;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              style={[
                                styles.chip,
                                {
                                  borderColor: on ? cc : theme.border,
                                  backgroundColor: on ? cc + '22' : theme.surface,
                                },
                              ]}
                              onPress={() => updateDiscount(d.key, { fotoAspect: opt.value })}
                            >
                              <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity
                        style={styles.discountPhotoBtn}
                        onPress={() => uploadDiscountPhoto(d.key)}
                        disabled={uploadingDiscountKey === d.key}
                      >
                        {d.fotoUrl ? (
                          <Image
                            source={{ uri: d.fotoUrl }}
                            style={[styles.discountPhotoWide, { aspectRatio: aspectRatioOf(d.fotoAspect) }]}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={[
                              styles.discountPhotoPlaceholderWide,
                              {
                                borderColor: theme.border,
                                aspectRatio: aspectRatioOf(d.fotoAspect),
                              },
                            ]}
                          >
                            {uploadingDiscountKey === d.key ? (
                              <ClubSpinLoader size={28} />
                            ) : (
                              <>
                                <Ionicons name="image-outline" size={22} color={theme.textMuted} />
                                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                                  Foto del descuento
                                </Text>
                              </>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                      {d.fotoUrl ? (
                        <TouchableOpacity onPress={() => updateDiscount(d.key, { fotoUrl: '' })} style={{ marginBottom: 8 }}>
                          <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Quitar foto</Text>
                        </TouchableOpacity>
                      ) : null}

                      <Text style={[s.label, { color: theme.textMuted }]}>Nombre del descuento</Text>
                      <TextInput
                        style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                        value={d.titulo}
                        onChangeText={(t) => updateDiscount(d.key, { titulo: t })}
                        placeholder="Ej. 20% en indumentaria"
                        placeholderTextColor={theme.textMuted}
                      />
                      <Text style={[s.label, { color: theme.textMuted }]}>Créditos (0 = sin créditos)</Text>
                      <TextInput
                        style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                        value={d.costoPuntos}
                        onChangeText={(t) => updateDiscount(d.key, { costoPuntos: t.replace(/[^0-9]/g, '') })}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={theme.textMuted}
                      />
                      <Text style={[s.label, { color: theme.textMuted }]}>Quién lo ve / puede usarlo</Text>
                      <View style={styles.chipRow}>
                        {ROLE_OPTIONS.map((opt) => {
                          const on = roleChipOn(d.rolesCanje, opt.value);
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              style={[
                                styles.chip,
                                {
                                  borderColor: on ? cc : theme.border,
                                  backgroundColor: on ? cc + '22' : theme.surface,
                                },
                              ]}
                              onPress={() => toggleDiscountRole(d.key, opt.value)}
                            >
                              <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.addDiscountBtn, { borderColor: cc }]}
                    onPress={addDiscount}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={cc} />
                    <Text style={{ color: cc, fontWeight: '700', marginLeft: 6 }}>Agregar otro descuento</Text>
                  </TouchableOpacity>

                  <Text style={[s.label, { color: theme.textMuted, marginTop: 12 }]}>
                    Beneficios de texto (opcional)
                  </Text>
                  <TextInput
                    style={[
                      s.input,
                      styles.beneficiosInput,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                    value={form.beneficios}
                    onChangeText={(t) => setForm((p) => ({ ...p, beneficios: t }))}
                    placeholder={'Perks fijos sin canje de créditos'}
                    placeholderTextColor={theme.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </>
              ) : (
                <>
                  <Text style={[s.label, { color: theme.textMuted }]}>Beneficios (una línea por beneficio)</Text>
                  <TextInput
                    style={[
                      s.input,
                      styles.beneficiosInput,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                    value={form.beneficios}
                    onChangeText={(t) => setForm((p) => ({ ...p, beneficios: t }))}
                    placeholder={'Ej.\n10% en indumentaria\nEntrada libre a eventos'}
                    placeholderTextColor={theme.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </>
              )}

              <Text style={[s.label, { color: theme.textMuted }]}>Tipos de usuario</Text>
              <View style={styles.chipRow}>
                {ROLE_OPTIONS.map((opt) => {
                  const on = roleChipOn(form.rolesAplicables, opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? cc : theme.border,
                          backgroundColor: on ? cc + '22' : theme.background,
                        },
                      ]}
                      onPress={() => toggleRole(opt.value)}
                    >
                      <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Cuotas sociales</Text>
              {socialFees.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginBottom: 12, fontSize: 13 }}>
                  No hay cuotas sociales cargadas.
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {socialFees.map((fee) => {
                    const id = String(fee._id);
                    const on = form.cuotasSociales.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.chip,
                          {
                            borderColor: on ? cc : theme.border,
                            backgroundColor: on ? cc + '22' : theme.background,
                          },
                        ]}
                        onPress={() => toggleFee(id)}
                      >
                        <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                          {fee.nombre || 'Cuota'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {editingId ? (
                <TouchableOpacity
                  style={[styles.activeToggle, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={() => setForm((p) => ({ ...p, activo: !p.activo }))}
                >
                  <Ionicons
                    name={form.activo ? 'checkmark-circle' : 'pause-circle-outline'}
                    size={20}
                    color={form.activo ? '#10b981' : theme.textMuted}
                  />
                  <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>
                    {form.activo ? 'Activo' : 'Inactivo'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, marginTop: 12 }]}
                onPress={saveForm}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Guardar</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.saveBtn,
                  contrastOutlineBtn(theme, isDarkMode),
                  { marginTop: 10, borderWidth: 1 },
                ]}
                onPress={() => setFormOpen(false)}
              >
                <Text style={[s.saveBtnTxt, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>
      </FormSheet>

      <FormSheet
        visible={!!discountsSponsor}
        onClose={closeDiscounts}
        title={
          discountDraft
            ? discountDraft._id
              ? 'Editar descuento'
              : 'Nuevo descuento'
            : `Descuentos · ${discountsSponsor?.nombre || ''}`
        }
        theme={theme}
        isDarkMode={isDarkMode}
      >
        {discountDraft ? (
          <>
            <Text style={[s.label, { color: theme.textMuted }]}>Aspecto de la imagen</Text>
            <View style={styles.chipRow}>
              {FOTO_ASPECT_OPTIONS.map((opt) => {
                const on = (discountDraft.fotoAspect || '16:9') === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? cc : theme.border,
                        backgroundColor: on ? cc + '22' : theme.background,
                        opacity: canMutate ? 1 : 0.7,
                      },
                    ]}
                    onPress={() =>
                      canMutate &&
                      setDiscountDraft((p) => (p ? { ...p, fotoAspect: opt.value } : p))
                    }
                    disabled={!canMutate}
                  >
                    <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.discountPhotoBtn}
              onPress={uploadManagedDiscountPhoto}
              disabled={!canMutate || uploadingDiscountKey === 'managed'}
            >
              {discountDraft.fotoUrl ? (
                <Image
                  source={{ uri: discountDraft.fotoUrl }}
                  style={[
                    styles.discountPhotoWide,
                    { aspectRatio: aspectRatioOf(discountDraft.fotoAspect) },
                  ]}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.discountPhotoPlaceholderWide,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                      aspectRatio: aspectRatioOf(discountDraft.fotoAspect),
                    },
                  ]}
                >
                  {uploadingDiscountKey === 'managed' ? (
                    <ClubSpinLoader size={32} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={22} color={theme.textMuted} />
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                        Foto del descuento
                      </Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>
            {discountDraft.fotoUrl && canMutate ? (
              <TouchableOpacity
                onPress={() => setDiscountDraft((p) => (p ? { ...p, fotoUrl: '' } : p))}
                style={{ marginBottom: 8 }}
              >
                <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>Quitar foto</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[s.label, { color: theme.textMuted }]}>Nombre</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={discountDraft.titulo}
              onChangeText={(t) => setDiscountDraft((p) => (p ? { ...p, titulo: t } : p))}
              placeholder="Ej. 15% en indumentaria"
              placeholderTextColor={theme.textMuted}
              editable={canMutate}
            />

            {loyaltyEnabled ? (
              <>
                <Text style={[s.label, { color: theme.textMuted }]}>Créditos (0 = sin créditos)</Text>
                <TextInput
                  style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  value={discountDraft.costoPuntos}
                  onChangeText={(t) =>
                    setDiscountDraft((p) => (p ? { ...p, costoPuntos: t.replace(/[^0-9]/g, '') } : p))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  editable={canMutate}
                />
              </>
            ) : (
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                Beneficio libre (sin créditos). Activá Créditos del club para canjes.
              </Text>
            )}

            <Text style={[s.label, { color: theme.textMuted }]}>Quién lo ve / puede usarlo</Text>
            <View style={styles.chipRow}>
              {ROLE_OPTIONS.map((opt) => {
                const on = roleChipOn(discountDraft.rolesCanje, opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? cc : theme.border,
                        backgroundColor: on ? cc + '22' : theme.background,
                        opacity: canMutate ? 1 : 0.7,
                      },
                    ]}
                    onPress={() => canMutate && toggleManagedDiscountRole(opt.value)}
                    disabled={!canMutate}
                  >
                    <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {discountDraft._id ? (
              <TouchableOpacity
                style={[
                  styles.activeToggle,
                  {
                    borderColor: discountDraft.activo ? '#10b981' : theme.border,
                    backgroundColor: discountDraft.activo ? '#10b98118' : theme.background,
                    opacity: canMutate ? 1 : 0.7,
                  },
                ]}
                onPress={() =>
                  canMutate &&
                  setDiscountDraft((p) => (p ? { ...p, activo: !p.activo } : p))
                }
                disabled={!canMutate}
              >
                <Ionicons
                  name={discountDraft.activo ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={discountDraft.activo ? '#10b981' : theme.textMuted}
                />
                <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>
                  {discountDraft.activo ? 'Activo' : 'Inactivo'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {canMutate ? (
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, marginTop: 12 }]}
                onPress={saveManagedDiscount}
                disabled={discountSaving}
              >
                {discountSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>Guardar</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                s.saveBtn,
                contrastOutlineBtn(theme, isDarkMode),
                { marginTop: 10, borderWidth: 1 },
              ]}
              onPress={() => setDiscountDraft(null)}
            >
              <Text style={[s.saveBtnTxt, { color: theme.text }]}>Volver</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
              {loyaltyEnabled
                ? '0 créditos = beneficio libre. Con créditos = canjeable en la app.'
                : 'Beneficios libres sin créditos para los miembros.'}
            </Text>

            {discountsLoading ? (
              <ClubSpinLoader size={48} style={{ marginVertical: 24 }} />
            ) : discounts.length === 0 ? (
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginVertical: 20 }}>
                Todavía no hay descuentos.
              </Text>
            ) : (
              discounts.map((reward) => {
                const inactive = reward.activo === false;
                return (
                  <View
                    key={String(reward._id)}
                    style={[
                      styles.discountCard,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                        opacity: inactive ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View style={styles.managedDiscountRow}>
                      {reward.fotoUrl ? (
                        <Image source={{ uri: reward.fotoUrl }} style={styles.managedDiscountThumb} />
                      ) : (
                        <View
                          style={[
                            styles.managedDiscountThumb,
                            styles.managedDiscountThumbPh,
                            { borderColor: theme.border },
                          ]}
                        >
                          <Ionicons name="pricetag-outline" size={18} color={theme.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }} numberOfLines={2}>
                          {reward.titulo}
                        </Text>
                        <Text style={{ color: cc, fontWeight: '700', marginTop: 2 }}>
                          {Number(reward.costoPuntos) > 0
                            ? `${reward.costoPuntos} créditos`
                            : 'Sin créditos'}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {formatRolesCanjeLabel(reward.rolesCanje)}
                          {inactive ? ' · Inactivo' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.actionsRow, { borderTopColor: theme.border, marginTop: 10 }]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.card || theme.background }]}
                        onPress={() => startEditDiscountDraft(reward)}
                      >
                        <Ionicons name="pencil-outline" size={14} color={theme.text} />
                        <Text style={[styles.actionTxt, { color: theme.text }]}>
                          {canMutate ? 'Editar' : 'Ver'}
                        </Text>
                      </TouchableOpacity>
                      {canMutate ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            {
                              borderColor: inactive ? '#a7f3d0' : '#fecaca',
                              backgroundColor: inactive ? '#ecfdf5' : '#fef2f2',
                            },
                          ]}
                          onPress={() => deactivateManagedDiscount(reward)}
                        >
                          <Ionicons
                            name={inactive ? 'refresh-outline' : 'close-circle-outline'}
                            size={14}
                            color={inactive ? '#10b981' : '#ef4444'}
                          />
                          <Text
                            style={[
                              styles.actionTxt,
                              { color: inactive ? '#10b981' : '#ef4444' },
                            ]}
                          >
                            {inactive ? 'Reactivar' : 'Desactivar'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}

            {canMutate ? (
              <TouchableOpacity
                style={[styles.addDiscountBtn, { borderColor: cc, marginTop: 8 }]}
                onPress={startNewDiscountDraft}
              >
                <Ionicons name="add-circle-outline" size={18} color={cc} />
                <Text style={{ color: cc, fontWeight: '700', marginLeft: 6 }}>Agregar descuento</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                s.saveBtn,
                contrastOutlineBtn(theme, isDarkMode),
                { marginTop: 12, borderWidth: 1 },
              ]}
              onPress={closeDiscounts}
            >
              <Text style={[s.saveBtnTxt, { color: theme.text }]}>Cerrar</Text>
            </TouchableOpacity>
          </>
        )}
      </FormSheet>

      <WebImageCropModal
        visible={Boolean(cropJob?.uri)}
        imageUri={cropJob?.uri}
        aspect={cropJob?.aspect || [1, 1]}
        colorMarca={cc}
        title={cropJob?.target === 'logo' ? 'Ajustar logo' : 'Ajustar foto del descuento'}
        onCancel={() => setCropJob(null)}
        onConfirm={confirmCroppedSponsorImage}
      />

      <CustomAlert
        visible={confirmCfg.visible}
        title={confirmCfg.title}
        message={confirmCfg.message}
        showCancel
        isDanger={confirmCfg.isDanger}
        confirmText={confirmCfg.confirmText}
        onConfirm={confirmCfg.onConfirm}
        onCancel={() => setConfirmCfg((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  blockTitle: { fontSize: 15, fontWeight: '800', marginTop: 14, marginBottom: 4 },
  discountCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  discountHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  discountPhotoBtn: { alignSelf: 'stretch', marginBottom: 8 },
  discountPhoto: { width: 72, height: 72, borderRadius: 8 },
  discountPhotoWide: { width: '100%', borderRadius: 10 },
  discountPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountPhotoPlaceholderWide: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDiscountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 4,
  },
  managedDiscountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  managedDiscountThumb: { width: 48, height: 48, borderRadius: 8 },
  managedDiscountThumbPh: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInner: { paddingBottom: 10 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 10 },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '800' },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionTxt: { fontSize: 12, fontWeight: '700' },
  photoBtn: { alignSelf: 'center', marginBottom: 6 },
  photoPreview: { width: 72, height: 72, borderRadius: 14 },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficiosInput: { minHeight: 72, paddingTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
});
