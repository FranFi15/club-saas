import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import DesignCard from '../../../components/DesignCard';
import { MN, fmtMoney } from './finanzasConstants';
import { finanzasStyles as s } from './finanzasStyles';

const EMPTY = {
  ingresos: {
    cuotas: { facturado: 0, cobrado: 0, pendiente: 0 },
    sponsors: { esperado: 0, cobrado: 0 },
    alquileres: { facturado: 0, cobrado: 0 },
    eventos: { cobrado: 0, ordenes: 0 },
    totalCobrado: 0,
    totalFacturado: 0,
  },
  egresos: {
    nomina: { total: 0 },
    gastos: { total: 0, pagado: 0, pendiente: 0 },
    total: 0,
  },
  resultado: 0,
};

function normalizeCaja(res) {
  return {
    ingresos: {
      ...EMPTY.ingresos,
      ...(res?.ingresos || {}),
      cuotas: { ...EMPTY.ingresos.cuotas, ...(res?.ingresos?.cuotas || {}) },
      sponsors: { ...EMPTY.ingresos.sponsors, ...(res?.ingresos?.sponsors || {}) },
      alquileres: { ...EMPTY.ingresos.alquileres, ...(res?.ingresos?.alquileres || {}) },
      eventos: { ...EMPTY.ingresos.eventos, ...(res?.ingresos?.eventos || {}) },
    },
    egresos: {
      nomina: { ...EMPTY.egresos.nomina, ...(res?.egresos?.nomina || {}) },
      gastos: { ...EMPTY.egresos.gastos, ...(res?.egresos?.gastos || {}) },
      total: res?.egresos?.total ?? 0,
    },
    resultado: res?.resultado ?? 0,
  };
}

function Row({ label, theme, primary, secondary, icon, colorMarca }) {
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: `${colorMarca}18` }]}>
          <Ionicons name={icon} size={18} color={colorMarca} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowPrimary, { color: theme.text }]}>{primary}</Text>
        {secondary ? (
          <Text style={[styles.rowSecondary, { color: theme.textMuted }]}>{secondary}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function CajaTab({
  clubData,
  theme,
  isDarkMode,
  primaryColor,
  getHeaders,
  showAlert,
  mes,
  anio,
}) {
  const cc = primaryColor || '#3b82f6';
  const cacheKey =
    clubData?.urlIdentifier && mes && anio
      ? `finanzas-caja:${clubData.urlIdentifier}:${mes}:${anio}`
      : '';

  const [data, setData] = useState(() => normalizeCaja(readScreenCache(cacheKey)));

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const { data: res } = await clubApi.get('/financial/caja', {
      headers: h,
      params: { mes, anio },
    });
    return normalizeCaja(res);
  }, [getHeaders, mes, anio]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData,
    onFetched: setData,
    onFetchError: (e) =>
      showAlert?.(
        'Caja',
        e.response?.data?.message || e.message || 'No se pudo cargar la caja.'
      ),
  });

  const { ingresos, egresos, resultado } = data;
  const resultadoPositive = (resultado || 0) >= 0;

  if (loading && !readScreenCache(cacheKey)) {
    return <ActivityIndicator color={cc} style={{ marginTop: 48 }} />;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
    >
      <Text style={[s.sectionTitle, { color: theme.text }]}>Caja</Text>
      <Text style={[s.sectionSub, { color: theme.textMuted }]}>
        Panorama del período · {MN[(mes || 1) - 1]} {anio}
      </Text>

      <View style={styles.summaryRow}>
        <DesignCard style={styles.summaryCard} theme={theme} isDarkMode={isDarkMode} accent={cc}>
          <View style={styles.summaryInner}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Ingresos</Text>
            <Text style={[styles.summaryValue, { color: '#10b981' }]}>
              {fmtMoney(ingresos.totalCobrado)}
            </Text>
            <Text style={[styles.summaryHint, { color: theme.textMuted }]}>cobrado</Text>
          </View>
        </DesignCard>
        <DesignCard style={styles.summaryCard} theme={theme} isDarkMode={isDarkMode} accent={cc}>
          <View style={styles.summaryInner}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Egresos</Text>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
              {fmtMoney(egresos.total)}
            </Text>
            <Text style={[styles.summaryHint, { color: theme.textMuted }]}>del período</Text>
          </View>
        </DesignCard>
      </View>

      <DesignCard style={{ marginBottom: 14 }} theme={theme} isDarkMode={isDarkMode} accent={cc}>
        <View style={styles.resultadoInner}>
          <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Resultado</Text>
          <Text
            style={[
              styles.resultadoValue,
              { color: resultadoPositive ? '#10b981' : '#ef4444' },
            ]}
          >
            {fmtMoney(resultado)}
          </Text>
          <Text style={[styles.summaryHint, { color: theme.textMuted }]}>
            Ingresos cobrados − egresos
          </Text>
        </View>
      </DesignCard>

      <Text style={[styles.sectionHead, { color: theme.text }]}>Ingresos</Text>
      <DesignCard style={{ marginBottom: 16 }} theme={theme} isDarkMode={isDarkMode} accent={cc}>
        <View style={styles.sectionBody}>
          <Row
            label="Cuotas"
            icon="card-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(ingresos.cuotas?.cobrado)}
            secondary={`Facturado ${fmtMoney(ingresos.cuotas?.facturado)} · Pend. ${fmtMoney(ingresos.cuotas?.pendiente)}`}
          />
          <Row
            label="Sponsors"
            icon="ribbon-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(ingresos.sponsors?.cobrado)}
            secondary={`Esperado ${fmtMoney(ingresos.sponsors?.esperado)}`}
          />
          <Row
            label="Alquileres"
            icon="calendar-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(ingresos.alquileres?.cobrado)}
            secondary={`Facturado ${fmtMoney(ingresos.alquileres?.facturado)}`}
          />
          <Row
            label="Eventos"
            icon="ticket-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(ingresos.eventos?.cobrado)}
            secondary={`${ingresos.eventos?.ordenes || 0} órdenes`}
          />
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Total cobrado</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>
              {fmtMoney(ingresos.totalCobrado)}
            </Text>
          </View>
        </View>
      </DesignCard>

      <Text style={[styles.sectionHead, { color: theme.text }]}>Egresos</Text>
      <DesignCard theme={theme} isDarkMode={isDarkMode} accent={cc}>
        <View style={styles.sectionBody}>
          <Row
            label="Nómina"
            icon="wallet-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(egresos.nomina?.total)}
          />
          <Row
            label="Gastos"
            icon="receipt-outline"
            colorMarca={cc}
            theme={theme}
            primary={fmtMoney(egresos.gastos?.total)}
            secondary={`Pagado ${fmtMoney(egresos.gastos?.pagado)} · Pend. ${fmtMoney(egresos.gastos?.pendiente)}`}
          />
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Total egresos</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>
              {fmtMoney(egresos.total)}
            </Text>
          </View>
        </View>
      </DesignCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  summaryCard: { flex: 1, marginBottom: 0 },
  summaryInner: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryHint: { fontSize: 11, marginTop: 2 },
  resultadoInner: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 16,
  },
  resultadoValue: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  sectionHead: { fontSize: 15, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  sectionBody: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowRight: { alignItems: 'flex-end', maxWidth: '48%' },
  rowPrimary: { fontSize: 15, fontWeight: '800' },
  rowSecondary: { fontSize: 11, marginTop: 2, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 16, fontWeight: '800' },
});
