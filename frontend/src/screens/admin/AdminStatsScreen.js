import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  LayoutAnimation,
  Animated,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import DesignCard from '../../components/DesignCard';
import CoachStatsBarChart from '../../components/CoachStatsBarChart';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { enableLayoutAnimationsIfNeeded } from '../../utils/layoutAnimation';
import { useChartLayout } from '../../utils/chartLayout';

enableLayoutAnimationsIfNeeded();

const ACCORDION_ANIM = LayoutAnimation.create(
  260,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

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

const SEXO_COLORS = {
  M: '#3b82f6',
  F: '#ec4899',
  sinDato: '#94a3b8',
};

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

function AccordionSection({
  id,
  title,
  summary,
  openId,
  onToggle,
  theme,
  isDarkMode,
  colorMarca,
  children,
}) {
  const open = openId === id;
  const chevron = useRef(new Animated.Value(open ? 1 : 0)).current;
  const bodyOpacity = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(chevron, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(bodyOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? 240 : 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, chevron, bodyOpacity]);

  const chevronRotate = chevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <DesignCard
      theme={theme}
      isDarkMode={isDarkMode}
      accent={colorMarca}
      style={styles.accordionCard}
      contentStyle={styles.accordionContent}
    >
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
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-down" size={20} color={colorMarca} />
        </Animated.View>
      </TouchableOpacity>
      {open ? (
        <Animated.View style={[styles.accordionBody, { opacity: bodyOpacity }]}>
          {children}
        </Animated.View>
      ) : null}
    </DesignCard>
  );
}

function StatTile({ label, value, theme, colorMarca, isDarkMode }) {
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : theme.background,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.tileValue, { color: colorMarca }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export default function AdminStatsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const chartLayout = useChartLayout();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const chartWidth = Math.max(220, chartLayout.chartWidth - 8);
  const chartHeight = Math.min(260, chartLayout.singleChartHeight);
  const cacheKey = clubData?.urlIdentifier ? `admin-club-stats:v5:${clubData.urlIdentifier}` : '';

  const [stats, setStats] = useState(() => readScreenCache(cacheKey) ?? null);
  const [openId, setOpenId] = useState(null);
  const [selectedDisciplinaId, setSelectedDisciplinaId] = useState(null);

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
    LayoutAnimation.configureNext(ACCORDION_ANIM);
    setOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next !== 'disciplinas') setSelectedDisciplinaId(null);
      return next;
    });
  }, []);

  const selectedDisciplina = useMemo(() => {
    if (!selectedDisciplinaId) return null;
    return (stats?.porDisciplina || []).find((d) => String(d._id) === String(selectedDisciplinaId)) || null;
  }, [stats?.porDisciplina, selectedDisciplinaId]);

  const categoriaBars = useMemo(() => {
    if (!selectedDisciplina) return [];
    return (selectedDisciplina.categorias || []).map((c) => ({
      key: String(c._id),
      label: c.nombre || '—',
      value: c.atletas || 0,
      color: colorMarca,
    }));
  }, [selectedDisciplina, colorMarca]);

  const onSelectDisciplina = useCallback((item) => {
    LayoutAnimation.configureNext(ACCORDION_ANIM);
    setSelectedDisciplinaId((prev) => (String(prev) === String(item.key) ? null : item.key));
  }, []);

  const resumen = stats?.resumen || {};
  const atletasTotal = resumen.atletas || 0;
  const opsTotal = OPS_ROWS.reduce((s, r) => s + (stats?.operaciones?.[r.key] || 0), 0);
  const socialPorRol = stats?.cuotasSociales?.porRol || {};
  const disciplinaBars = useMemo(
    () =>
      (stats?.porDisciplina || []).map((d) => ({
        key: String(d._id),
        label: d.nombre || '—',
        value: d.atletas || 0,
        color: colorMarca,
      })),
    [stats?.porDisciplina, colorMarca],
  );

  const sexoBars = useMemo(
    () =>
      SEXO_ROWS.map((r) => ({
        key: r.key,
        label: r.key === 'M' ? 'Masc.' : r.key === 'F' ? 'Fem.' : 'Sin dato',
        value: stats?.sexo?.[r.key] || 0,
        color: SEXO_COLORS[r.key] || colorMarca,
      })),
    [stats?.sexo, colorMarca],
  );

  const edadBars = useMemo(
    () =>
      AGE_ROWS.map((r) => ({
        key: r.key,
        label:
          r.key === 'lte10' ? '≤10' : r.key === 'gte19' ? '≥19' : r.key === 'sinFecha' ? 'S/F' : r.label,
        value: stats?.edad?.[r.key] || 0,
        color: colorMarca,
      })),
    [stats?.edad, colorMarca],
  );

  const profesionalesBars = useMemo(
    () =>
      (stats?.profesionales || []).map((p) => ({
        key: `p-${p.rol}`,
        label: USER_ROL_LABELS[p.rol] || p.rol,
        value: p.count || 0,
        color: colorMarca,
      })),
    [stats?.profesionales, colorMarca],
  );

  const gestionBars = useMemo(
    () =>
      (stats?.gestion || []).map((p) => ({
        key: `g-${p.rol}`,
        label: USER_ROL_LABELS[p.rol] || p.rol,
        value: p.count || 0,
        color: '#8b5cf6',
      })),
    [stats?.gestion],
  );

  const renderFinanceCard = (bundle) => (
    <View
      style={[
        styles.financeCard,
        {
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : theme.background,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.financeMonth, { color: theme.textMuted }]}>
        {bundle?.mes && bundle?.anio
          ? `${String(bundle.mes).padStart(2, '0')}/${bundle.anio}`
          : 'Mes actual'}
      </Text>
      <Text style={[styles.financePct, { color: colorMarca }]}>
        {bundle?.porcentajeCobranza ?? 0}% cobranza
      </Text>
      <Text style={[styles.financeLine, { color: theme.text }]}>
        Facturado ${formatMoney(bundle?.facturado)} · Cobrado ${formatMoney(bundle?.cobrado)}
      </Text>
      <View style={styles.financeRow}>
        <Text style={{ color: theme.textMuted }}>Pendientes</Text>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{bundle?.pendiente ?? 0}</Text>
      </View>
      <View style={styles.financeRow}>
        <Text style={{ color: theme.textMuted }}>Vencidas (mes)</Text>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{bundle?.vencido ?? 0}</Text>
      </View>
      <View style={styles.financeRow}>
        <Text style={{ color: theme.textMuted }}>Pagadas</Text>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{bundle?.pagado ?? 0}</Text>
      </View>
      <View style={[styles.financeRow, styles.financeRowLast]}>
        <Text style={{ color: theme.textMuted }}>Vencidas (global)</Text>
        <Text style={{ color: '#ef4444', fontWeight: '700' }}>{bundle?.vencidosGlobal ?? 0}</Text>
      </View>
    </View>
  );

  const accordionProps = { openId, onToggle, theme, isDarkMode, colorMarca };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AdminScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Estructura"
        title="Estadísticas"
        subtitle={clubData?.nombre || 'Tu club'}
        sidebarRoot
        onBack={() => navigation.goBack()}
        showNotifications={false}
      />

      {loading && !stats ? (
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
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
            summary={`${resumen.atletas ?? 0} atletas · ${resumen.socios ?? 0} socios · ${resumen.profesionales ?? 0} profesionales`}
            {...accordionProps}
          >
            <View style={styles.tileGrid}>
              <StatTile
                label="Atletas"
                value={String(resumen.atletas ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
              <StatTile
                label="Socios"
                value={String(resumen.socios ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
              <StatTile
                label="Sin categoría"
                value={String(resumen.atletasSinInscripcion ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
              <StatTile
                label="Profesionales"
                value={String(resumen.profesionales ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
              <StatTile
                label="Tutores"
                value={String(resumen.tutores ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
              <StatTile
                label="Disc. · Cat."
                value={`${resumen.disciplinas ?? 0} · ${resumen.categorias ?? 0}`}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
            </View>
          </AccordionSection>

          <AccordionSection
            id="socios"
            title="Socios"
            summary={`${stats?.socios?.total ?? resumen.socios ?? 0} activo(s)`}
            {...accordionProps}
          >
            <View style={styles.tileGrid}>
              <StatTile
                label="Socios activos"
                value={String(stats?.socios?.total ?? resumen.socios ?? 0)}
                theme={theme}
                colorMarca={colorMarca}
                isDarkMode={isDarkMode}
              />
            </View>
          </AccordionSection>

          <AccordionSection
            id="disciplinas"
            title="Atletas por disciplina"
            summary={`${stats?.porDisciplina?.length ?? 0} disciplina(s)`}
            {...accordionProps}
          >
            {disciplinaBars.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>No hay disciplinas activas.</Text>
            ) : (
              <>
                <Text style={[styles.chartHint, { color: theme.textMuted }]}>
                  Tocá una disciplina para ver sus categorías
                </Text>
                <CoachStatsBarChart
                  items={disciplinaBars}
                  width={chartWidth}
                  height={Math.max(chartHeight, 40 + disciplinaBars.length * 18)}
                  theme={{ ...theme, primary: colorMarca }}
                  onBarPress={onSelectDisciplina}
                  selectedKey={selectedDisciplinaId}
                />
                {selectedDisciplina ? (
                  <>
                    <Text style={[styles.subHead, { color: theme.textMuted }]}>
                      Categorías · {selectedDisciplina.nombre}
                    </Text>
                    {categoriaBars.length === 0 ? (
                      <Text style={[styles.empty, { color: theme.textMuted }]}>Sin categorías</Text>
                    ) : (
                      <CoachStatsBarChart
                        items={categoriaBars}
                        width={chartWidth}
                        height={Math.max(200, 40 + categoriaBars.length * 22)}
                        theme={{ ...theme, primary: colorMarca }}
                      />
                    )}
                  </>
                ) : null}
              </>
            )}
          </AccordionSection>

          <AccordionSection
            id="sexo"
            title="Sexo"
            summary={`M ${stats?.sexo?.M ?? 0} · F ${stats?.sexo?.F ?? 0} · Sin dato ${stats?.sexo?.sinDato ?? 0}`}
            {...accordionProps}
          >
            <CoachStatsBarChart
              items={sexoBars}
              width={chartWidth}
              height={chartHeight}
              theme={{ ...theme, primary: colorMarca }}
            />
          </AccordionSection>

          <AccordionSection
            id="edad"
            title="Edad"
            summary={`${atletasTotal} atletas`}
            {...accordionProps}
          >
            <CoachStatsBarChart
              items={edadBars}
              width={chartWidth}
              height={Math.max(chartHeight, 220)}
              theme={{ ...theme, primary: colorMarca }}
            />
          </AccordionSection>

          <AccordionSection
            id="profesionales"
            title="Profesionales"
            summary={`${resumen.profesionales ?? 0} plantel · ${resumen.gestion ?? 0} gestión`}
            {...accordionProps}
          >
            {profesionalesBars.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>Sin profesionales cargados.</Text>
            ) : (
              <CoachStatsBarChart
                items={profesionalesBars}
                width={chartWidth}
                height={Math.max(200, 40 + profesionalesBars.length * 22)}
                theme={{ ...theme, primary: colorMarca }}
              />
            )}
            <Text style={[styles.subHead, { color: theme.textMuted }]}>Gestión</Text>
            {gestionBars.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>Sin roles de gestión.</Text>
            ) : (
              <CoachStatsBarChart
                items={gestionBars}
                width={chartWidth}
                height={Math.max(180, 40 + gestionBars.length * 22)}
                theme={{ ...theme, primary: '#8b5cf6' }}
              />
            )}
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
                  style={[
                    styles.opsRow,
                    {
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : theme.background,
                      borderColor: theme.border,
                    },
                  ]}
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
            title="Cuotas de entrenamiento"
            summary={`${stats?.finanzas?.porcentajeCobranza ?? 0}% cobranza · ${stats?.finanzas?.vencidosGlobal ?? 0} vencidas`}
            {...accordionProps}
          >
            {renderFinanceCard(stats?.finanzas)}
          </AccordionSection>

          <AccordionSection
            id="cuotasSociales"
            title="Cuotas sociales"
            summary={`${stats?.cuotasSociales?.porcentajeCobranza ?? 0}% cobranza · ${stats?.cuotasSociales?.totalMes ?? 0} del mes`}
            {...accordionProps}
          >
            {renderFinanceCard(stats?.cuotasSociales)}
            <Text style={[styles.subHead, { color: theme.textMuted }]}>
              Titulares del mes (atleta, tutor o socio)
            </Text>
            <CoachStatsBarChart
              items={[
                { key: 'atleta', label: 'Atletas', value: socialPorRol.atleta || 0, color: colorMarca },
                { key: 'tutor', label: 'Tutores', value: socialPorRol.tutor || 0, color: colorMarca },
                { key: 'socio', label: 'Socios', value: socialPorRol.socio || 0, color: colorMarca },
                ...(socialPorRol.otro
                  ? [{ key: 'otro', label: 'Otros', value: socialPorRol.otro || 0, color: '#94a3b8' }]
                  : []),
              ]}
              width={chartWidth}
              height={200}
              theme={{ ...theme, primary: colorMarca }}
            />
          </AccordionSection>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  accordionCard: { marginBottom: 12 },
  accordionContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
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
  chartHint: { fontSize: 12, marginBottom: 2, marginTop: 2 },
  subHead: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tileValue: { fontSize: 22, fontWeight: '800' },
  tileLabel: { fontSize: 12, marginTop: 4 },
  empty: { fontSize: 14 },
  opsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
