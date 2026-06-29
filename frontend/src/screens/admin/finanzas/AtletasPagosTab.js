import React, { useMemo, useCallback, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { finanzasStyles as s } from './finanzasStyles';
import { MN, ESTADO_FILTROS, EST_COLOR, fmtMoney } from './finanzasConstants';
import UserAvatar from '../../../components/UserAvatar';
import SearchableDropdown from '../../../components/SearchableDropdown';
import { compareUserByName } from '../../../utils/listSort';

const PAYMENT_STATUS_ORDER = { vencido: 0, pendiente: 1, en_revision: 2, pagado: 3 };

function groupPaymentsByAthlete(payments) {
  const map = new Map();
  for (const p of payments) {
    const aid = p.atleta?._id || p.atleta;
    if (!aid) continue;
    const key = String(aid);
    if (!map.has(key)) {
      map.set(key, { atleta: p.atleta, payments: [] });
    }
    map.get(key).payments.push(p);
  }
  return Array.from(map.values()).map((row) => {
    const sorted = [...row.payments].sort((a, b) => {
      return (PAYMENT_STATUS_ORDER[a.estado] ?? 9) - (PAYMENT_STATUS_ORDER[b.estado] ?? 9);
    });
    const primary = sorted[0];
    const unpaid = sorted.find((x) => x.estado === 'pendiente' || x.estado === 'vencido');
    return {
      atleta: row.atleta,
      primary,
      payTarget: unpaid || primary,
      payments: sorted,
      totalMonto: sorted.reduce((sum, x) => sum + (x.montoFinal || 0), 0),
    };
  });
}

function AthleteActionsMenu({
  visible,
  item,
  theme,
  colorMarca,
  onClose,
  onPay,
  onSelectPayments,
  onHistory,
}) {
  if (!item) return null;

  const { atleta, payments: cuotas } = item;
  const payables = cuotas.filter((p) => ['pendiente', 'vencido'].includes(p.estado));
  const canPay = payables.length > 0;
  const nombre = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim();

  const handlePay = () => {
    onClose();
    if (!canPay) return;
    if (payables.length === 1) onPay(payables[0], atleta);
    else onSelectPayments(payables, nombre, [atleta]);
  };

  const handleHistory = () => {
    onClose();
    onHistory(atleta);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <Pressable style={[styles.menuSheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.menuTitle, { color: theme.text }]} numberOfLines={1}>
            {nombre}
          </Text>
          <TouchableOpacity
            style={[styles.menuItem, !canPay && styles.menuItemDisabled]}
            onPress={handlePay}
            disabled={!canPay}
          >
            <Ionicons name="cash-outline" size={20} color={canPay ? '#10b981' : theme.textMuted} />
            <Text style={[styles.menuItemText, { color: canPay ? theme.text : theme.textMuted }]}>
              {payables.length > 1 ? `Pagar (${payables.length})` : 'Pagar'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleHistory}>
            <Ionicons name="time-outline" size={20} color={colorMarca} />
            <Text style={[styles.menuItemText, { color: theme.text }]}>Historial</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuCancel, { borderTopColor: theme.border }]} onPress={onClose}>
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AtletasPagosTab({
  theme,
  primaryColor,
  mes,
  anio,
  payments,
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
}) {
  const cc = primaryColor;
  const isVencidosView = filtroEstado === 'vencido';
  const isTodosView = filtroEstado === 'todos';
  const [menuItem, setMenuItem] = useState(null);

  const athletes = useMemo(() => {
    const grouped = groupPaymentsByAthlete(payments);
    return grouped.sort((a, b) => compareUserByName(a.atleta, b.atleta));
  }, [payments]);

  const openMenu = useCallback((item) => setMenuItem(item), []);
  const closeMenu = useCallback(() => setMenuItem(null), []);

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

        <View style={styles.filterDropdown}>
          <SearchableDropdown
            data={ESTADO_FILTROS}
            value={filtroEstado}
            onChange={setFiltroEstado}
            placeholder="Estado de cuota"
            theme={theme}
            colorMarca={cc}
            compact
            searchable={false}
            borderRadius={5}
            inputHeight={48}
          />
          {isRefreshingPayments ? (
            <ActivityIndicator size="small" color={cc} style={styles.filterRefreshing} />
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} colors={[cc]} />
        }
      />

      <AthleteActionsMenu
        visible={!!menuItem}
        item={menuItem}
        theme={theme}
        colorMarca={cc}
        onClose={closeMenu}
        onPay={onPay}
        onSelectPayments={onSelectPayments}
        onHistory={onHistory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { marginBottom: 8 },
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
  filterDropdown: { marginBottom: 12, position: 'relative' },
  filterRefreshing: { position: 'absolute', right: 44, top: 14 },
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
  menuSheet: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
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
