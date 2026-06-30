import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { finanzasStyles as s } from './finanzasStyles';
import { MN, EST_COLOR, fmtMoney } from './finanzasConstants';

export default function FamiliasTab({
  theme,
  primaryColor,
  mes,
  anio,
  siblings,
  isLoading,
  isRefreshing = false,
  filtroBusqueda,
  setFiltroBusqueda,
  isSearchPending = false,
  refreshing,
  onRefresh,
  hasMoreFamilias = false,
  loadingMoreFamilias = false,
  onLoadMoreFamilias,
  globalDiscount,
  globalDiscountInput,
  onGlobalDiscountChange,
  onSaveGlobalDiscount,
  isSavingGlobalDiscount,
  discountInput,
  onDiscountChange,
  onApplyDiscount,
  onPayCuota,
  onSelectPayments,
  onHistoryAtleta,
  canManageDiscounts = true,
}) {
  const cc = primaryColor;
  const [expandedGlobalDiscount, setExpandedGlobalDiscount] = useState(false);
  const [expandedAthletes, setExpandedAthletes] = useState({});
  const [expandedDiscount, setExpandedDiscount] = useState({});

  const toggleSection = (setter, tutorId) => {
    setter((prev) => ({ ...prev, [tutorId]: !prev[tutorId] }));
  };

  const familyDiscountDisplay = (g) => {
    if (g.descuentoFamiliar != null && g.descuentoFamiliar !== '') return g.descuentoFamiliar;
    return Math.max(0, ...(g.hijos || []).map((h) => h.descuentoPorcentaje || 0));
  };

  const estadoCuota = (cuota) => {
    if (!cuota) return { label: 'Sin cuota', color: theme.textMuted };
    const ec = EST_COLOR[cuota.estado] || '#999';
    return { label: cuota.estado, color: ec };
  };

  const renderFamilyCard = useCallback(
    ({ item: g }) => {
      const tutorId = g.tutor._id;
      const pctActual = familyDiscountDisplay(g);
      const inputVal = discountInput[tutorId] ?? (pctActual ? String(pctActual) : '');
      const impagas = g.cuotasImpagas || [];
      const canPayAll = impagas.length > 0;

      return (
        <View
          style={[styles.familyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={styles.familyHeader}>
            <View style={[s.planIcon, { backgroundColor: '#8b5cf620' }]}>
              <Ionicons name="people" size={20} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>Tutor</Text>
              <Text style={[s.planName, { color: theme.text }]}>
                {g.tutor.nombre} {g.tutor.apellido}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>Impago total</Text>
              <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 16 }}>
                {fmtMoney(g.totalImpago)}
              </Text>
            </View>
          </View>

          {canPayAll ? (
            <TouchableOpacity
              style={[styles.payBtnFamilia, { backgroundColor: '#10b981' }]}
              onPress={() =>
                onSelectPayments(impagas, `${g.tutor.nombre} ${g.tutor.apellido}`, g.hijos)
              }
            >
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.payBtnFamiliaTxt}>Pagar</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() => toggleSection(setExpandedAthletes, tutorId)}
            >
              <Ionicons
                name={expandedAthletes[tutorId] ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={cc}
              />
              <Text style={[styles.toggleBtnTxt, { color: theme.text }]}>
                Atletas ({g.hijos.length})
              </Text>
            </TouchableOpacity>
            {canManageDiscounts ? (
              <TouchableOpacity
                style={[styles.toggleBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => toggleSection(setExpandedDiscount, tutorId)}
              >
                <Ionicons
                  name={expandedDiscount[tutorId] ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#8b5cf6"
                />
                <Text style={[styles.toggleBtnTxt, { color: theme.text }]}>
                  Descuento{pctActual > 0 ? ` (${pctActual}%)` : ''}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {expandedAthletes[tutorId]
            ? g.hijos.map((h) => {
                const cuota = h.cuotaMes;
                const st = estadoCuota(cuota);
                const hijoImpagas = h.cuotasImpagas || [];
                const payables = hijoImpagas.length
                  ? hijoImpagas
                  : cuota && ['pendiente', 'vencido'].includes(cuota.estado)
                    ? [cuota]
                    : [];

                return (
                  <View key={h._id} style={[styles.childBlock, { borderColor: theme.border }]}>
                    <View style={styles.childRow}>
                      <Text style={{ color: theme.text, flex: 1, fontSize: 14, fontWeight: '600' }}>
                        {h.nombre} {h.apellido}
                      </Text>
                      {cuota ? (
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                          {fmtMoney(cuota.montoFinal)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
                      {cuota
                        ? `${MN[mes - 1]} ${anio} · ${cuota.plan?.nombre || 'Cuota'}`
                        : `Sin cuota en ${MN[mes - 1]} ${anio}`}
                      {hijoImpagas.length > 1 ? ` · ${hijoImpagas.length} impagas` : ''}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: st.color + '22', alignSelf: 'flex-start', marginBottom: 8 },
                      ]}
                    >
                      <Text
                        style={{
                          color: st.color,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'capitalize',
                        }}
                      >
                        {st.label}
                      </Text>
                    </View>
                    <View style={styles.childActions}>
                      <TouchableOpacity
                        style={[
                          styles.childBtn,
                          {
                            backgroundColor: payables.length ? '#10b981' : theme.background,
                            borderColor: theme.border,
                          },
                        ]}
                        onPress={() => {
                          if (!payables.length) return;
                          if (payables.length === 1) onPayCuota(payables[0], h);
                          else onSelectPayments(payables, `${h.nombre} ${h.apellido}`, [h]);
                        }}
                        disabled={!payables.length}
                      >
                        <Text
                          style={{
                            color: payables.length ? '#fff' : theme.textMuted,
                            fontWeight: '700',
                            fontSize: 12,
                          }}
                        >
                          Pagar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.childBtn, styles.childBtnOutline, { borderColor: cc }]}
                        onPress={() => onHistoryAtleta(h)}
                      >
                        <Text style={{ color: cc, fontWeight: '700', fontSize: 12 }}>Historial</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            : null}

          {canManageDiscounts && expandedDiscount[tutorId] ? (
            <View style={[styles.discountBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.discountLabel, { color: theme.text }]}>Descuento familiar (%)</Text>
              <Text style={[styles.discountHint, { color: theme.textMuted }]}>
                {g.descuentoEsPersonalizado
                  ? 'Descuento personalizado para esta familia.'
                  : globalDiscount > 0
                    ? `Si no cambiás el valor, se usa el global (${globalDiscount}%).`
                    : 'Porcentaje aplicado a las inscripciones activas.'}
              </Text>
              <View style={styles.discountRow}>
                <TextInput
                  style={[
                    s.input,
                    styles.discountInput,
                    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                  ]}
                  placeholder="0–100"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  value={inputVal}
                  onChangeText={(v) => onDiscountChange(tutorId, v)}
                />
                <TouchableOpacity
                  style={[styles.applyBtn, { backgroundColor: '#8b5cf6' }]}
                  onPress={() => onApplyDiscount(tutorId)}
                >
                  <Text style={styles.applyBtnTxt}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      );
    },
    [
      theme,
      cc,
      mes,
      anio,
      expandedAthletes,
      expandedDiscount,
      discountInput,
      globalDiscount,
      canManageDiscounts,
      onSelectPayments,
      onPayCuota,
      onHistoryAtleta,
      onDiscountChange,
      onApplyDiscount,
    ],
  );

  const listHeader = (
    <>
      {canManageDiscounts ? (
        <TouchableOpacity
          style={[styles.globalToggleBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={() => setExpandedGlobalDiscount((v) => !v)}
        >
          <Ionicons
            name={expandedGlobalDiscount ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={cc}
          />
          <Text style={[styles.toggleBtnTxt, { color: theme.text, flex: 1 }]}>
            Descuento global{globalDiscount > 0 ? ` (${globalDiscount}%)` : ''}
          </Text>
        </TouchableOpacity>
      ) : null}

      {canManageDiscounts && expandedGlobalDiscount ? (
        <View style={[styles.globalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.discountLabel, { color: theme.text }]}>Descuento por defecto (%)</Text>
          <Text style={[styles.discountHint, { color: theme.textMuted }]}>
            Se aplica a familias nuevas sin descuento personalizado.
          </Text>
          <View style={styles.discountRow}>
            <TextInput
              style={[
                s.input,
                styles.discountInput,
                { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
              ]}
              placeholder="Ej: 10"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={globalDiscountInput}
              onChangeText={onGlobalDiscountChange}
            />
            <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 16 }}>%</Text>
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: cc, opacity: isSavingGlobalDiscount ? 0.6 : 1 }]}
              onPress={onSaveGlobalDiscount}
              disabled={isSavingGlobalDiscount}
            >
              <Text style={styles.applyBtnTxt}>{isSavingGlobalDiscount ? '...' : 'Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={[s.sectionTitle, { color: theme.text, marginTop: 12, marginBottom: 8 }]}>Familias</Text>

      <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Buscar tutor o atleta"
          placeholderTextColor={theme.textMuted}
          value={filtroBusqueda}
          onChangeText={setFiltroBusqueda}
          autoCorrect={false}
          returnKeyType="search"
        />
        {filtroBusqueda ? (
          <TouchableOpacity onPress={() => setFiltroBusqueda('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.icon} />
          </TouchableOpacity>
        ) : isSearchPending || isRefreshing ? (
          <ActivityIndicator size="small" color={cc} />
        ) : null}
      </View>
    </>
  );

  const renderListEmpty = useCallback(() => {
    if (isLoading) {
      return <ActivityIndicator color={cc} style={{ marginTop: 40 }} size="large" />;
    }
    if (filtroBusqueda.trim()) {
      return (
        <View style={s.empty}>
          <Ionicons name="search-outline" size={50} color={theme.icon} />
          <Text style={[s.emptyTxt, { color: theme.text }]}>Sin resultados</Text>
          <Text style={[s.emptySub, { color: theme.textMuted }]}>Probá otro nombre de tutor o atleta.</Text>
        </View>
      );
    }
    return (
      <View style={s.empty}>
        <Ionicons name="people-outline" size={50} color={theme.icon} />
        <Text style={[s.emptyTxt, { color: theme.text }]}>Sin familias con tutor</Text>
      </View>
    );
  }, [isLoading, cc, theme, filtroBusqueda]);

  return (
    <View style={s.tabPanel}>
      <FlatList
        style={s.tabScroll}
        data={siblings}
        keyExtractor={(item) => String(item.tutor._id)}
        renderItem={renderFamilyCard}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={
          siblings.length === 0 ? { flexGrow: 1, paddingBottom: 30, paddingTop: 8 } : { paddingBottom: 30, paddingTop: 8 }
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (hasMoreFamilias && !loadingMoreFamilias) onLoadMoreFamilias?.();
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMoreFamilias ? <ActivityIndicator color={cc} style={{ marginVertical: 16 }} /> : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} colors={[cc]} />
        }
      />
    </View>
  );
}

const styles = {
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
  globalToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
  },
  globalBox: { borderRadius: 5, borderWidth: 1, padding: 14, marginBottom: 16 },
  familyCard: { borderRadius: 5, borderWidth: 1, padding: 14, marginBottom: 14 },
  familyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  payBtnFamilia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 5,
    marginBottom: 12,
  },
  payBtnFamiliaTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 5,
    borderWidth: 1,
  },
  toggleBtnTxt: { fontWeight: '700', fontSize: 12 },
  childBlock: { borderTopWidth: 1, paddingTop: 12, marginTop: 8 },
  childRow: { flexDirection: 'row', alignItems: 'center' },
  childActions: { flexDirection: 'row', gap: 8 },
  childBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  childBtnOutline: { backgroundColor: 'transparent' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  discountBox: { marginTop: 12, padding: 12, borderRadius: 5, borderWidth: 1 },
  discountLabel: { fontSize: 14, fontWeight: '800' },
  discountHint: { fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discountInput: { flex: 1, marginBottom: 0, minWidth: 0 },
  applyBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 5 },
  applyBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
};
