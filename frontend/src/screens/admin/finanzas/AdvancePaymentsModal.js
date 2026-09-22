import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { MN } from './finanzasConstants';

const PRESETS = [1, 2, 3, 6, 12];

function addMonths(mes, anio, delta) {
  const idx = anio * 12 + (mes - 1) + delta;
  return { mes: (idx % 12) + 1, anio: Math.floor(idx / 12) };
}

function periodLabel(mes, anio) {
  return `${MN[(mes || 1) - 1] || mes} ${anio}`;
}

function isoToDisplay(iso) {
  if (!iso) return '';
  const ymd = String(iso).split('T')[0];
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
}

export default function AdvancePaymentsModal({
  visible,
  onClose,
  atleta,
  theme,
  primaryColor,
  mes,
  anio,
  getHeaders,
  onConfirm,
  onDismiss,
}) {
  const [cantidad, setCantidad] = useState(3);
  const [incluirSocial, setIncluirSocial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [advanceInfo, setAdvanceInfo] = useState(null);

  const startMes = Number(advanceInfo?.desdeMes) || Number(mes) || new Date().getMonth() + 1;
  const startAnio = Number(advanceInfo?.desdeAnio) || Number(anio) || new Date().getFullYear();

  useEffect(() => {
    if (!visible) return;
    setIncluirSocial(true);
    setSaving(false);
    setAdvanceInfo(null);

    let cancelled = false;
    const requestMes = Number(mes) || new Date().getMonth() + 1;
    const requestAnio = Number(anio) || new Date().getFullYear();
    (async () => {
      if (!atleta?._id || !getHeaders) {
        setCantidad(3);
        return;
      }
      setLoadingInfo(true);
      try {
        const h = await getHeaders();
        const r = await clubApi.get(`/financial/payments/advance-info/${atleta._id}`, {
          headers: h,
          params: { mes: requestMes, anio: requestAnio },
        });
        if (cancelled) return;
        const info = r.data || null;
        setAdvanceInfo(info);
        const max = Number(info?.maxMeses);
        if (info?.limitadoPorGrilla && Number.isFinite(max)) {
          // Default to the full remaining range so the last (possibly partial) month is included.
          if (max < 1) setCantidad(1);
          else setCantidad(max);
        } else {
          setCantidad(3);
        }
      } catch {
        if (!cancelled) {
          setAdvanceInfo(null);
          setCantidad(3);
        }
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, atleta?._id, getHeaders, mes, anio]);

  const maxMeses = useMemo(() => {
    if (advanceInfo?.limitadoPorGrilla && Number.isFinite(Number(advanceInfo.maxMeses))) {
      return Math.max(0, Number(advanceInfo.maxMeses));
    }
    return 24;
  }, [advanceInfo]);

  const presets = useMemo(() => {
    if (maxMeses <= 0) return PRESETS;
    const base = PRESETS.filter((n) => n <= maxMeses);
    // Always offer the exact tope (e.g. 4 months Sep→Dic) even if not in PRESETS.
    if (!base.includes(maxMeses)) base.push(maxMeses);
    return base.sort((a, b) => a - b);
  }, [maxMeses]);

  const rango = useMemo(() => {
    const capped = maxMeses > 0 ? Math.min(cantidad, maxMeses) : cantidad;
    const from = { mes: startMes, anio: startAnio };
    const to = addMonths(startMes, startAnio, Math.max(0, capped - 1));
    return { from, to, capped };
  }, [startMes, startAnio, cantidad, maxMeses]);

  const nombre = atleta
    ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim()
    : '';

  const grillaBloqueada = advanceInfo?.limitadoPorGrilla && maxMeses < 1;

  const handleConfirm = async () => {
    if (!atleta?._id || saving || grillaBloqueada) return;
    setSaving(true);
    try {
      await onConfirm?.({
        atletaId: atleta._id,
        cantidadMeses: grillaBloqueada ? 1 : Math.max(1, rango.capped),
        incluirSocial,
        desdeMes: startMes,
        desdeAnio: startAnio,
      });
      onClose?.();
    } catch {
      /* parent shows alert */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Adelantar cuotas</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.icon} />
            </TouchableOpacity>
          </View>
          {nombre ? (
            <Text style={[styles.sub, { color: theme.textMuted }]}>{nombre}</Text>
          ) : null}

          {loadingInfo ? (
            <ActivityIndicator color={primaryColor} style={{ marginVertical: 20 }} />
          ) : (
            <>
              {advanceInfo?.limitadoPorGrilla ? (
                <View style={[styles.capBox, { backgroundColor: `${primaryColor}14`, borderColor: primaryColor }]}>
                  <Ionicons name="calendar-outline" size={18} color={primaryColor} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.capTitle, { color: theme.text }]}>
                      Tope por fin de grilla
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 17 }}>
                      {grillaBloqueada
                        ? 'La grilla ya terminó y tiene “terminar cuotas” activo. No hay meses de entrenamiento para adelantar.'
                        : `Con “terminar cuotas al finalizar” solo se pueden crear cuotas de entrenamiento hasta ${periodLabel(
                            advanceInfo.tope?.mes,
                            advanceInfo.tope?.anio,
                          )}${
                            advanceInfo.tope?.vigenteHasta
                              ? ` (última sesión ${isoToDisplay(advanceInfo.tope.vigenteHasta)})`
                              : ''
                          }. El mes del tope se incluye aunque la grilla termine a mitad de mes.`}
                    </Text>
                    {advanceInfo?.solicitadoMes &&
                    (Number(advanceInfo.solicitadoMes) !== Number(advanceInfo.desdeMes) ||
                      Number(advanceInfo.solicitadoAnio) !== Number(advanceInfo.desdeAnio)) ? (
                      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                        El mes actual de Finanzas ya pasó el tope; se genera desde{' '}
                        {periodLabel(advanceInfo.desdeMes, advanceInfo.desdeAnio)}.
                      </Text>
                    ) : null}
                    {(advanceInfo.caps || []).length > 1 ? (
                      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                        {(advanceInfo.caps || [])
                          .map(
                            (c) =>
                              `${c.categoriaNombre}: ${periodLabel(c.mes, c.anio)}`,
                          )
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {grillaBloqueada
                  ? 'Podés generar solo cuota social si corresponde.'
                  : `Se crean cuotas pendientes desde ${periodLabel(rango.from.mes, rango.from.anio)}${
                      rango.capped > 1
                        ? ` hasta ${periodLabel(rango.to.mes, rango.to.anio)}`
                        : ''
                    }. Las que ya existan se omiten.`}
              </Text>

              {!grillaBloqueada ? (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Cantidad de meses</Text>
                  <View style={styles.presets}>
                    {(presets.length ? presets : [Math.max(1, maxMeses)]).map((n) => {
                      const active = cantidad === n;
                      return (
                        <TouchableOpacity
                          key={n}
                          style={[
                            styles.preset,
                            {
                              borderColor: active ? primaryColor : theme.border,
                              backgroundColor: active ? `${primaryColor}18` : theme.background,
                            },
                          ]}
                          onPress={() => setCantidad(n)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={{
                              color: active ? primaryColor : theme.text,
                              fontWeight: '800',
                              fontSize: 15,
                            }}
                          >
                            {n}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <View style={[styles.switchRow, { borderColor: theme.border }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.switchLabel, { color: theme.text }]}>Incluir cuota social</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Si tiene tipo asignado y no está exento. No está limitada por la grilla.
                  </Text>
                </View>
                <Switch
                  value={incluirSocial}
                  onValueChange={setIncluirSocial}
                  trackColor={{ false: theme.border, true: `${primaryColor}88` }}
                  thumbColor={incluirSocial ? primaryColor : '#f4f4f5'}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.confirm,
                  {
                    backgroundColor: primaryColor,
                    opacity: saving || (grillaBloqueada && !incluirSocial) ? 0.55 : 1,
                  },
                ]}
                onPress={handleConfirm}
                disabled={saving || (grillaBloqueada && !incluirSocial)}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmTxt}>
                    {grillaBloqueada ? 'Crear cuota social' : 'Crear cuotas'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    borderRadius: 16,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 8 },
  sub: { fontSize: 14, marginTop: 4, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 10, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  preset: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  capTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
  },
  switchLabel: { fontSize: 14, fontWeight: '700' },
  confirm: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
