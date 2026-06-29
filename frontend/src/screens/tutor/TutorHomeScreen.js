import React, { useContext, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import UserAvatar from '../../components/UserAvatar';
import { platformCardShadow } from '../../utils/platformShadow';

const SHORTCUTS = [
  { tab: 'TutorAgenda', icon: 'calendar-outline', label: 'Agenda' },
  { tab: 'TutorPayments', icon: 'wallet-outline', label: 'Cuotas' },
  {
    tab: 'TutorComunicar',
    screen: 'MemberCommsHub',
    icon: 'chatbubbles-outline',
    label: 'Comunicar',
  },
  {
    tab: 'TutorComunicar',
    screen: 'MemberDocuments',
    icon: 'document-attach-outline',
    label: 'Documentación',
  },
];

function fmtMoney(n) {
  return `$${(n || 0).toLocaleString('es-AR')}`;
}

export default function TutorHomeScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { profile, hijos, activeHijo, activeAtletaId, setActiveAtletaId, loading, loadError, refresh } = useMember();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const dashboardCacheKey = clubData?.urlIdentifier ? `tutor-dashboard:${clubData.urlIdentifier}` : '';

  const [dashboard, setDashboard] = useState(() => readScreenCache(dashboardCacheKey) ?? []);

  const fetchDashboard = useCallback(async () => {
    if (!clubData?.urlIdentifier) return [];
    const h = await clubHeaders(clubData);
    const res = await clubApi.get('/users/tutor-dashboard', { headers: h });
    return res.data || [];
  }, [clubData?.urlIdentifier]);

  const { loading: dashLoading, refreshing, onRefresh: refreshDashboard } = useCachedFocusLoad({
    cacheKey: dashboardCacheKey,
    enabled: !!dashboardCacheKey,
    fetchData: fetchDashboard,
    onFetched: setDashboard,
    onFetchError: () => setDashboard([]),
  });

  const onRefresh = useCallback(() => {
    refresh({ background: true });
    refreshDashboard();
  }, [refresh, refreshDashboard]);

  const showInitialLoader = (loading || dashLoading) && dashboard.length === 0;

  const activeSummary = useMemo(
    () => dashboard.find((d) => String(d._id) === String(activeAtletaId)),
    [dashboard, activeAtletaId],
  );

  const navigateShortcut = (s) => {
    if (s.screen) {
      navigation.navigate(s.tab, { screen: s.screen });
    } else {
      navigation.navigate(s.tab);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Familia"
        title={`Hola, ${profile?.nombre || 'Tutor'}`}
        subtitle={clubData?.nombre || 'Gestioná la actividad de tus atletas'}
        footer={
          <CoachHeaderBadge>
            <Ionicons name="people-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeTxt} numberOfLines={1}>
              {hijos.length} atleta{hijos.length === 1 ? '' : 's'} a cargo
            </Text>
          </CoachHeaderBadge>
        }
      />

      <MemberChildPicker theme={theme} colorMarca={colorMarca} compact={hijos.length <= 1} />

      {showInitialLoader ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colorMarca} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
        >
          {!hijos.length ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="alert-circle-outline" size={40} color={theme.icon} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin atletas vinculados</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                {loadError ||
                  'En Usuarios, editá cada atleta y elegí este tutor en «Tutor principal». Guardá los cambios y volvé a cargar.'}
              </Text>
              <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colorMarca }]} onPress={onRefresh}>
                <Text style={styles.retryBtnTxt}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {activeHijo && activeSummary ? (
                <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, platformCardShadow(4)]}>
                  <Text style={[styles.summaryTitle, { color: theme.text }]}>
                    {activeHijo.nombre} {activeHijo.apellido}
                  </Text>
                  <Text style={[styles.summarySub, { color: theme.textMuted }]}>
                    {activeHijo.edad != null ? `${activeHijo.edad} años` : 'Edad no registrada'} · Podés pagar cuotas
                    desde la pestaña Cuotas
                  </Text>
                  <View style={styles.statsRow}>
                    <View style={[styles.statBox, { backgroundColor: theme.background }]}>
                      <Text style={[styles.statNum, { color: activeSummary.docsPendientes ? '#f59e0b' : '#22c55e' }]}>
                        {activeSummary.docsPendientes}
                      </Text>
                      <Text style={[styles.statLbl, { color: theme.textMuted }]}>Docs. pendientes</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: theme.background }]}>
                      <Text style={[styles.statNum, { color: activeSummary.cuotasVencidas ? '#ef4444' : '#3b82f6' }]}>
                        {activeSummary.cuotasPendientes}
                      </Text>
                      <Text style={[styles.statLbl, { color: theme.textMuted }]}>Cuotas a pagar</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: theme.background }]}>
                      <Text style={[styles.statNum, { color: theme.text }]}>{fmtMoney(activeSummary.deuda)}</Text>
                      <Text style={[styles.statLbl, { color: theme.textMuted }]}>Deuda</Text>
                    </View>
                  </View>
                  {(activeSummary.docsPendientes > 0 || activeSummary.cuotasPendientes > 0) && (
                    <View style={styles.quickAlerts}>
                      {activeSummary.docsPendientes > 0 ? (
                        <TouchableOpacity
                          style={[styles.alertRow, { borderColor: '#f59e0b44' }]}
                          onPress={() => navigation.navigate('TutorComunicar', { screen: 'MemberDocuments' })}
                        >
                          <Ionicons name="document-attach-outline" size={20} color="#f59e0b" />
                          <Text style={[styles.alertTxt, { color: theme.text }]}>
                            {activeSummary.docsPendientes} documento{activeSummary.docsPendientes === 1 ? '' : 's'} por
                            subir o corregir
                          </Text>
                          <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                        </TouchableOpacity>
                      ) : null}
                      {activeSummary.cuotasPendientes > 0 ? (
                        <TouchableOpacity
                          style={[styles.alertRow, { borderColor: '#ef444444' }]}
                          onPress={() => navigation.navigate('TutorPayments')}
                        >
                          <Ionicons name="wallet-outline" size={20} color="#ef4444" />
                          <Text style={[styles.alertTxt, { color: theme.text }]}>
                            {activeSummary.cuotasPendientes} cuota{activeSummary.cuotasPendientes === 1 ? '' : 's'}{' '}
                            pendiente{activeSummary.cuotasPendientes === 1 ? '' : 's'}
                          </Text>
                          <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}

              {hijos.length > 1 ? (
                <>
                  <Text style={[styles.section, { color: theme.text }]}>Tus atletas</Text>
                  {dashboard.map((d) => {
                    const on = String(d._id) === String(activeAtletaId);
                    const hasAlerts = Boolean(hijos.find((h) => String(h._id) === String(d._id))?.tieneAlertas);
                    return (
                      <TouchableOpacity
                        key={d._id}
                        style={[
                          styles.hijoRow,
                          { backgroundColor: theme.surface, borderColor: on ? colorMarca : theme.border },
                        ]}
                        onPress={() => setActiveAtletaId(d._id)}
                      >
                        <UserAvatar user={d} size={44} colorMarca={colorMarca} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.hijoName, { color: theme.text }]}>
                            {d.nombre} {d.apellido}
                          </Text>
                          <Text style={[styles.hijoMeta, { color: theme.textMuted }]}>
                            {d.edad != null ? `${d.edad} años` : ''}
                            {d.docsPendientes ? ` · ${d.docsPendientes} doc. pend.` : ''}
                            {d.cuotasPendientes ? ` · ${d.cuotasPendientes} cuota(s)` : ''}
                          </Text>
                        </View>
                        {hasAlerts ? <View style={styles.alertDot} /> : null}
                        {on ? <Ionicons name="checkmark-circle" size={22} color={colorMarca} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              <Text style={[styles.section, { color: theme.text }]}>Accesos rápidos</Text>
              <View style={styles.grid}>
                {SHORTCUTS.map((s) => (
                  <TouchableOpacity
                    key={`${s.tab}-${s.screen || s.label}`}
                    style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }, platformCardShadow(3)]}
                    onPress={() => navigateShortcut(s)}
                  >
                    <Ionicons name={s.icon} size={28} color={colorMarca} />
                    <Text style={[styles.tileLbl, { color: theme.text }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 18, fontWeight: '800' },
  summarySub: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statBox: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statNum: { fontSize: 16, fontWeight: '800' },
  statLbl: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  quickAlerts: { marginTop: 14, gap: 8 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  alertTxt: { flex: 1, fontSize: 14, fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  hijoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  hijoName: { fontSize: 16, fontWeight: '700' },
  hijoMeta: { fontSize: 13, marginTop: 2 },
  alertDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  tileLbl: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
