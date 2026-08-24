import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { finanzasStyles as s } from './finanzasStyles';
import { MN, ESTADO_FILTROS, EST_COLOR, fmtMoney } from './finanzasConstants';
import UserAvatar from '../../../components/UserAvatar';

function AthleteActionsMenu({
  visible,
  item,
  theme,
  colorMarca,
  onClose,
  onDismissed,
  onPay,
  onSelectPayments,
  onHistory,
}) {
  const pendingActionRef = useRef(null);

  const flushPendingAction = useCallback(() => {
    if (!pendingActionRef.current) return;
    const fn = pendingActionRef.current;
    pendingActionRef.current = null;
    fn();
  }, []);

  const runAfterClose = useCallback((action) => {
    if (Platform.OS === 'ios') {
      pendingActionRef.current = action;
      onClose();
      setTimeout(() => {
        if (pendingActionRef.current) flushPendingAction();
      }, 450);
    } else {
      onClose();
      action();
    }
  }, [onClose, flushPendingAction]);

  const handleMenuDismissed = useCallback(() => {
    flushPendingAction();
    onDismissed?.();
  }, [flushPendingAction, onDismissed]);

  if (!visible && !item) return null;

  const { atleta, payments: cuotas } = item || { atleta: null, payments: [] };
  const payables = cuotas.filter((p) => ['pendiente', 'vencido'].includes(p.estado));
  const canPay = payables.length > 0;
  const nombre = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim();

  const handlePay = () => {
    if (!canPay) return;
    runAfterClose(() => {
      if (payables.length === 1) onPay(payables[0], atleta);
      else onSelectPayments(payables, nombre, [atleta]);
    });
  };

  const handleHistory = () => {
    runAfterClose(() => onHistory(atleta));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      onDismiss={handleMenuDismissed}
    >
      <View style={styles.menuOverlay}>
        <Pressable style={styles.menuBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.menuSheet, { backgroundColor: theme.surface }]}>
          <Text style={[styles.menuTitle, { color: theme.text }]} numberOfLines={1}>
            {nombre}
          </Text>
          <TouchableOpacity
            style={[styles.menuItem, !canPay && styles.menuItemDisabled]}
            onPress={handlePay}
            disabled={!canPay}
            activeOpacity={0.75}
          >
            <Ionicons name="cash-outline" size={20} color={canPay ? '#10b981' : theme.textMuted} />
            <Text style={[styles.menuItemText, { color: canPay ? theme.text : theme.textMuted }]}>
              {payables.length > 1 ? `Pagar (${payables.length})` : 'Pagar'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleHistory} activeOpacity={0.75}>
            <Ionicons name="time-outline" size={20} color={colorMarca} />
            <Text style={[styles.menuItemText, { color: theme.text }]}>Historial</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuCancel, { borderTopColor: theme.border }]} onPress={onClose} activeOpacity={0.75}>
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AtletasPagosTab({
  theme,
  primaryColor,
  mes,
  anio,
  athletes,
  isLoadingPay,
  isRefreshingPayments = false,
  filtroBusqueda,
  setFiltroBusqueda,
  filtroEstado,
  setFiltroEstado,
  isSearchPending = false,
  refreshing,
  onRefresh,
  onPay,
  onSelectPayments,
  onHistory,
  hasMorePayments = false,
  loadingMorePayments = false,
  onLoadMorePayments,
  paymentStats,
  isLoadingStats = false,
}) {
  const cc = primaryColor;
  const isVencidosView = filtroEstado === 'vencido';
  const isTodosView = filtroEstado === 'todos';
  const [menuItem, setMenuItem] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const stats = paymentStats || {};

  const openMenu = useCallback((item) => {
    setMenuItem(item);
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const clearMenuItem = useCallback(() => setMenuItem(null), []);

  const renderCard = ({ item }) => {
    const { atleta, primary, payments: cuotas } = item;
    const ec = EST_COLOR[primary?.estado] || '#999';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.85}
        onPress={() => openMenu(item)}
      >
        <View style={styles.cardTop}>
          <UserAvatar user={atleta} size={44} colorMarca={cc} />
          <View style={styles.cardInfo}>
            <Text style={[styles.name, { color: theme.text }]}>
              {atleta?.nombre} {atleta?.apellido}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
              {primary?.plan?.nombre || 'Sin plan'}
              {primary?.categoria?.nombre ? ` · ${primary.categoria.nombre}` : ''}
              {isVencidosView && primary?.mes && primary?.anio
                ? ` · ${MN[primary.mes - 1]} ${primary.anio}`
                : ''}
            </Text>
            {cuotas.length > 1 ? (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                {isVencidosView
                  ? `${cuotas.length} cuotas vencidas`
                  : isTodosView
                    ? `${cuotas.length} cuota${cuotas.length === 1 ? '' : 's'} en ${MN[mes - 1]}`
                    : `${cuotas.length} cuota${cuotas.length === 1 ? '' : 's'} en ${MN[mes - 1]}`}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardAmount}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{fmtMoney(primary?.montoFinal)}</Text>
            <View style={[styles.badge, { backgroundColor: ec + '22' }]}>
              <Text style={{ color: ec, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
                {primary?.estado?.replace('_', ' ')}
              </Text>
            </View>
          </View>
          <View style={[styles.menuBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListEmpty = useCallback(() => {
    if (isLoadingPay) {
      return <ActivityIndicator color={cc} style={{ marginTop: 40 }} size="large" />;
    }
    return (
      <View style={s.empty}>
        <Ionicons name="people-outline" size={50} color={theme.icon} />
        <Text style={[s.emptyTxt, { color: theme.text }]}>
          {isTodosView ? 'Sin atletas con cuotas en este mes' : 'Sin atletas para este filtro'}
        </Text>
        <Text style={[s.emptySub, { color: theme.textMuted }]}>
          {isTodosView
            ? 'Generá las cuotas del período o probá otro mes.'
            : 'Probá otro estado, mes o generá las cuotas del período.'}
        </Text>
      </View>
    );
  }, [isLoadingPay, cc, theme, isTodosView]);

  return (
    <View style={s.tabPanel}>
      <View style={styles.headerBlock}>
        <View style={styles.resumenToggleRow}>
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Resumen</Text>
          <View style={styles.headerBtns}>
            <TouchableOpacity
              style={[styles.resumenToggleBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => setFilterOpen(true)}
            >
              <Ionicons name="funnel-outline" size={16} color={cc} />
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>Filtrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resumenToggleBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => setShowResumen((v) => !v)}
            >
              <Ionicons name={showResumen ? 'eye-off-outline' : 'eye-outline'} size={16} color={cc} />
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                {showResumen ? 'Ocultar' : 'Mostrar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showResumen ? (
          isLoadingStats ? (
            <ActivityIndicator color={cc} style={{ marginBottom: 12 }} />
          ) : (
            <>
              <View style={s.statsRow}>
                <View style={[s.statBox, { backgroundColor: theme.surface }]}>
                  <Text style={{ color: cc, fontSize: 18, fontWeight: 'bold' }}>{fmtMoney(stats.totalFacturado)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    {isVencidosView ? 'Total vencido' : 'Facturado'}
                  </Text>
                </View>
                <View style={[s.statBox, { backgroundColor: theme.surface }]}>
                  <Text style={{ color: '#10b981', fontSize: 18, fontWeight: 'bold' }}>
                    {fmtMoney(stats.totalCobrado)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Cobrado</Text>
                </View>
              </View>
              {!isVencidosView ? (
                <View style={s.statsRow}>
                  <View style={[s.statMini, { backgroundColor: theme.surface }]}>
                    <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{stats.pagados || 0}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>Pagados</Text>
                  </View>
                  <View style={[s.statMini, { backgroundColor: theme.surface }]}>
                    <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>{stats.pendientes || 0}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>Pendientes</Text>
                  </View>
                  <View style={[s.statMini, { backgroundColor: theme.surface }]}>
                    <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>{stats.vencidos || 0}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>Vencidos</Text>
                  </View>
                </View>
              ) : (
                <View style={[s.statMini, { backgroundColor: theme.surface, marginBottom: 10, paddingVertical: 12 }]}>
                  <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16 }}>{stats.vencidos || 0}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Cuotas vencidas (todas)</Text>
                </View>
              )}
              {!isVencidosView && stats.porcentajeCobranza != null ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                  Cobranza {stats.porcentajeCobranza}%
                  {stats.porcentajePrev != null ? ` · mes anterior ${stats.porcentajePrev}%` : ''}
                </Text>
              ) : null}
            </>
          )
        ) : null}

        <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar atleta"
            placeholderTextColor={theme.textMuted}
            value={filtroBusqueda}
            onChangeText={setFiltroBusqueda}
            autoCorrect={false}
            returnKeyType="search"
            blurOnSubmit={false}
          />
          {filtroBusqueda ? (
            <TouchableOpacity onPress={() => setFiltroBusqueda('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          ) : isSearchPending ? (
            <ActivityIndicator size="small" color={cc} />
          ) : null}
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={athletes}
        keyExtractor={(item) => String(item.atleta?._id)}
        renderItem={renderCard}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={athletes.length === 0 ? styles.listEmptyGrow : { paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (hasMorePayments && !loadingMorePayments) onLoadMorePayments?.();
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMorePayments ? (
            <ActivityIndicator color={cc} style={{ marginVertical: 16 }} />
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} colors={[cc]} />
        }
      />

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.menuOverlay}>
          <Pressable style={styles.menuBackdrop} onPress={() => setFilterOpen(false)} />
          <View style={[styles.menuSheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.menuTitle, { color: theme.text }]}>Estado de cuota</Text>
            {ESTADO_FILTROS.map((opt) => {
              const active = filtroEstado === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.menuItem, active && { backgroundColor: `${cc}14` }]}
                  onPress={() => {
                    setFiltroEstado(opt.value);
                    setFilterOpen(false);
                  }}
                >
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={active ? cc : theme.textMuted}
                  />
                  <Text style={[styles.menuItemText, { color: active ? cc : theme.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <AthleteActionsMenu
        visible={menuOpen}
        item={menuItem}
        theme={theme}
        colorMarca={cc}
        onClose={closeMenu}
        onDismissed={clearMenuItem}
        onPay={onPay}
        onSelectPayments={onSelectPayments}
        onHistory={onHistory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { marginTop: 12, marginBottom: 8 },
  list: { flex: 1 },
  listEmptyGrow: { flexGrow: 1, paddingBottom: 24 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  resumenToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  resumenToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  card: {
    borderRadius: 5,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  cardAmount: { alignItems: 'flex-end', marginLeft: 8 },
  menuBtn: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 4 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuSheet: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 2,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  menuItemDisabled: { opacity: 0.55 },
  menuItemText: { fontSize: 16, fontWeight: '600' },
  menuCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: 1,
  },
});
