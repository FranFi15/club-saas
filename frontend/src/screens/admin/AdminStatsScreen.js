import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const AGE_ROWS = [
  { key: 'lte10', label: 'Hasta 10' },
  { key: '11', label: '11' },
  { key: '12', label: '12' },
  { key: '13', label: '13' },
  { key: '14', label: '14' },
  { key: '15', label: '15' },
  { key: '16', label: '16' },
  { key: '17', label: '17' },
  { key: '18', label: '18' },
  { key: 'gte19', label: '19 o más' },
  { key: 'sinFecha', label: 'Sin fecha' },
];

const SEXO_ROWS = [
  { key: 'M', label: 'Masculino' },
  { key: 'F', label: 'Femenino' },
  { key: 'sinDato', label: 'Sin dato' },
];

const OPS_ROWS = [
  {
    key: 'transferenciasRevision',
    label: 'Transferencias por revisar',
    icon: 'receipt-outline',
    nav: { tab: 'Finanzas', screen: 'FinanzasHome', params: { initialTab: 'revision' } },
  },
  {
    key: 'docsRevision',
    label: 'Documentación por revisar',
    icon: 'folder-open-outline',
    nav: { tab: 'Gestión', screen: 'RevisarDocumentacion' },
  },
  {
    key: 'solicitudesInscripcion',
    label: 'Solicitudes de inscripción',
    icon: 'person-add-outline',
    nav: { tab: 'Estructura', screen: 'SolicitudesInscripcion' },
  },
  {
    key: 'alquileres',
    label: 'Alquileres pendientes',
    icon: 'time-outline',
    nav: { tab: 'Gestión', screen: 'Alquileres' },
  },
  {
    key: 'chat',
    label: 'Mensajes sin leer',
    icon: 'chatbubbles-outline',
    nav: { tab: 'Gestión', screen: 'ChatInbox' },
  },
];

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function navigateOps(navigation, nav) {
  if (!nav?.tab || !navigation) return;
  if (nav.tab === 'Estructura' && nav.screen) {
    navigation.navigate(nav.screen, nav.params);
    return;
  }
  const tabNav = navigation.getParent();
  if (!tabNav?.navigate) return;
  if (nav.screen) {
    tabNav.navigate(nav.tab, { screen: nav.screen, params: nav.params });
  } else {
    tabNav.navigate(nav.tab, nav.params);
  }
}

function AccordionSection({ id, title, summary, openId, onToggle, theme, colorMarca, children }) {
  const open = openId === id;
  return (
    <View style={[styles.accordion, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={() => onToggle(id)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.accordionTitle, { color: theme.text }]}>{title}</Text>
          {summary && !open ? (
            <Text style={[styles.accordionSummary, { color: theme.textMuted }]} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colorMarca}
        />
      </TouchableOpacity>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function StatTile({ label, value, theme, colorMarca }) {
  return (
    <View style={[styles.tile, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Text style={[styles.tileValue, { color: colorMarca }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function BarRow({ label, count, total, theme, colorMarca, showPct = true }) {
  const denom = Math.max(total || 0, 1);
  const pct = Math.round((count / denom) * 100);
  const widthPct = Math.min(100, pct);
  return (
    <View style={styles.barRow}>
      <View style={styles.barTop}>
        <Text style={[styles.barLabel, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.barCount, { color: theme.textMuted }]}>
          {showPct ? `${count} · ${pct}%` : String(count)}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${widthPct}%`,
              backgroundColor: colorMarca,
              minWidth: count > 0 ? 4 : 0,
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function AdminStatsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const cacheKey = clubData?.urlIdentifier ? `admin-club-stats:v2:${clubData.urlIdentifier}` : '';

  const [stats, setStats] = useState(() => readScreenCache(cacheKey) ?? null);
  const [openId, setOpenId] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!clubData?.urlIdentifier) return null;
    const token = await getToken('userToken');
    const { data } = await clubApi.get('/stats/club', {
      headers: {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchStats,
    onFetched: setStats,
  });

  const onToggle = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const resumen = stats?.resumen || {};
  const atletasTotal = resumen.atletas || 0;
  const sexoTotal =
    (stats?.sexo?.M || 0) + (stats?.sexo?.F || 0) + (stats?.sexo?.sinDato || 0);
  const edadTotal = AGE_ROWS.reduce((s, r) => s + (stats?.edad?.[r.key] || 0), 0);
  const discMax = Math.max(1, ...(stats?.porDisciplina || []).map((d) => d.atletas || 0), 1);
  const opsTotal = OPS_ROWS.reduce((s, r) => s + (stats?.operaciones?.[r.key] || 0), 0);

  const accordionProps = { openId, onToggle, theme, colorMarca };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Estructura"
        title="Estadísticas"
        subtitle="Demografía, plantel y pendientes del club"
        onBack={() => navigation.goBack()}
        showNotifications={false}
      />

      {loading && !stats ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colorMarca} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
        >
          <AccordionSection
            id="resumen"
            title="Resumen"
            summary={`${resumen.atletas ?? 0} atletas · ${resumen.profesionales ?? 0} profesionales`}
            {...accordionProps}
          >
            <View style={styles.tileGrid}>
              <StatTile label="Atletas" value={String(resumen.atletas ?? 0)} theme={theme} colorMarca={colorMarca} />
              <StatTile
                label="Sin categoría"
                value={String(resumen.atletasSinInscripcion ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
              />
              <StatTile
                label="Profesionales"
                value={String(resumen.profesionales ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
              />
              <StatTile label="Tutores" value={String(resumen.tutores ?? 0)} theme={theme} colorMarca={colorMarca} />
              <StatTile
                label="Disciplinas"
                value={String(resumen.disciplinas ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
              />
              <StatTile
                label="Categorías"
                value={String(resumen.categorias ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
              />
            </View>
          </AccordionSection>

          <AccordionSection
            id="disciplinas"
            title="Atletas por disciplina"
            summary={`${stats?.porDisciplina?.length ?? 0} disciplina(s)`}
            {...accordionProps}
          >
            {(stats?.porDisciplina || []).length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>No hay disciplinas activas.</Text>
            ) : (
              (stats.porDisciplina || []).map((d) => (
                <BarRow
                  key={String(d._id)}
                  label={d.nombre}
                  count={d.atletas || 0}
                  total={discMax}
                  theme={theme}
                  colorMarca={colorMarca}
                  showPct={false}
                />
              ))
            )}
          </AccordionSection>

          <AccordionSection
            id="sexo"
            title="Sexo"
            summary={`M ${stats?.sexo?.M ?? 0} · F ${stats?.sexo?.F ?? 0} · Sin dato ${stats?.sexo?.sinDato ?? 0}`}
            {...accordionProps}
          >
            {SEXO_ROWS.map((r) => (
              <BarRow
                key={r.key}
                label={r.label}
                count={stats?.sexo?.[r.key] || 0}
                total={sexoTotal || atletasTotal}
                theme={theme}
                colorMarca={colorMarca}
              />
            ))}
          </AccordionSection>

          <AccordionSection
            id="edad"
            title="Edad"
            summary={`${atletasTotal} atletas`}
            {...accordionProps}
          >
            {AGE_ROWS.map((r) => (
              <BarRow
                key={r.key}
                label={r.label}
                count={stats?.edad?.[r.key] || 0}
                total={edadTotal || atletasTotal}
                theme={theme}
                colorMarca={colorMarca}
              />
            ))}
          </AccordionSection>

          <AccordionSection
            id="profesionales"
            title="Profesionales"
            summary={`${resumen.profesionales ?? 0} plantel · ${resumen.gestion ?? 0} gestión`}
            {...accordionProps}
          >
            {(stats?.profesionales || []).map((p) => (
              <BarRow
                key={p.rol}
                label={USER_ROL_LABELS[p.rol] || p.rol}
                count={p.count || 0}
                total={Math.max(1, resumen.profesionales || 1)}
                theme={theme}
                colorMarca={colorMarca}
              />
            ))}
            <Text style={[styles.subHead, { color: theme.textMuted }]}>Gestión</Text>
            {(stats?.gestion || []).map((p) => (
              <BarRow
                key={p.rol}
                label={USER_ROL_LABELS[p.rol] || p.rol}
                count={p.count || 0}
                total={Math.max(1, resumen.gestion || 1)}
                theme={theme}
                colorMarca={colorMarca}
              />
            ))}
          </AccordionSection>

          <AccordionSection
            id="pendientes"
            title="Pendientes"
            summary={`${opsTotal} ítem(s)`}
            {...accordionProps}
          >
            {OPS_ROWS.map((row) => {
              const count = stats?.operaciones?.[row.key] || 0;
              return (
                <TouchableOpacity
                  key={row.key}
                  style={[styles.opsRow, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => navigateOps(navigation, row.nav)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.opsIcon, { backgroundColor: colorMarca + '18' }]}>
                    <Ionicons name={row.icon} size={20} color={colorMarca} />
                  </View>
                  <Text style={[styles.opsLabel, { color: theme.text }]}>{row.label}</Text>
                  <Text style={[styles.opsCount, { color: count ? colorMarca : theme.textMuted }]}>
                    {count}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                </TouchableOpacity>
              );
            })}
          </AccordionSection>

          <AccordionSection
            id="finanzas"
            title="Finanzas del mes"
            summary={`${stats?.finanzas?.porcentajeCobranza ?? 0}% cobranza · ${stats?.finanzas?.vencidosGlobal ?? 0} vencidas`}
            {...accordionProps}
          >
            <View style={[styles.financeCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.financeMonth, { color: theme.textMuted }]}>
                {stats?.finanzas?.mes && stats?.finanzas?.anio
                  ? `${String(stats.finanzas.mes).padStart(2, '0')}/${stats.finanzas.anio}`
                  : 'Mes actual'}
              </Text>
              <Text style={[styles.financePct, { color: colorMarca }]}>
                {stats?.finanzas?.porcentajeCobranza ?? 0}% cobranza
              </Text>
              <Text style={[styles.financeLine, { color: theme.text }]}>
                Facturado ${formatMoney(stats?.finanzas?.facturado)} · Cobrado $
                {formatMoney(stats?.finanzas?.cobrado)}
              </Text>
              <View style={styles.financeRow}>
                <Text style={{ color: theme.textMuted }}>Pendientes</Text>
                <Text style={{ color: theme.text, fontWeight: '700' }}>
                  {stats?.finanzas?.pendiente ?? 0}
                </Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={{ color: theme.textMuted }}>Vencidas (mes)</Text>
                <Text style={{ color: theme.text, fontWeight: '700' }}>
                  {stats?.finanzas?.vencido ?? 0}
                </Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={{ color: theme.textMuted }}>Pagadas</Text>
                <Text style={{ color: theme.text, fontWeight: '700' }}>
                  {stats?.finanzas?.pagado ?? 0}
                </Text>
              </View>
              <View style={[styles.financeRow, styles.financeRowLast]}>
                <Text style={{ color: theme.textMuted }}>Vencidas (global)</Text>
                <Text style={{ color: '#ef4444', fontWeight: '700' }}>
                  {stats?.finanzas?.vencidosGlobal ?? 0}
                </Text>
              </View>
            </View>
          </AccordionSection>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  accordion: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  accordionTitle: { fontSize: 16, fontWeight: '800' },
  accordionSummary: { fontSize: 12, marginTop: 2 },
  accordionBody: { paddingHorizontal: 14, paddingBottom: 14 },
  subHead: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tileValue: { fontSize: 22, fontWeight: '800' },
  tileLabel: { fontSize: 12, marginTop: 4 },
  barRow: { marginBottom: 12 },
  barTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  barLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  barCount: { fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  empty: { fontSize: 14 },
  opsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  opsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opsLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  opsCount: { fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  financeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  financeMonth: { fontSize: 12, fontWeight: '600' },
  financePct: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  financeLine: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(127,127,127,0.25)',
  },
  financeRowLast: { marginTop: 2 },
});
