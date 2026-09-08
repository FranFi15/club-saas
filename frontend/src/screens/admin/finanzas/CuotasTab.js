import React, { useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { finanzasStyles as s } from './finanzasStyles';
import { MN, ESTADO_FILTROS, EST_COLOR, fmtMoney } from './finanzasConstants';
import SearchableDropdown from '../../../components/SearchableDropdown';
import DesignCard from '../../../components/DesignCard';
import { ThemeContext } from '../../../context/ThemeContext';

export default function CuotasTab({
  theme,
  primaryColor,
  mes,
  anio,
  onPrevMonth,
  onNextMonth,
  stats,
  payments,
  isLoadingPay,
  filtroBusqueda,
  setFiltroBusqueda,
  filtroEstado,
  setFiltroEstado,
  showResumen,
  onToggleResumen,
  onGenerate,
  isGenerating,
  refreshingCuotas,
  onRefreshCuotas,
  onOpenPay,
  autoGenerateNote,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const cc = primaryColor;

  const renderPayment = (item) => {
    const ec = EST_COLOR[item.estado] || '#999';
    const canPay = item.estado !== 'pagado';
    return (
      <DesignCard
        key={item._id}
        theme={theme}
        isDarkMode={isDarkMode}
        accent={ec}
        onPress={canPay ? () => onOpenPay(item) : undefined}
        muted={!canPay}
        contentStyle={s.cardInner}
        style={{ marginBottom: 10 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.planName, { color: theme.text }]}>
            {item.atleta?.nombre} {item.atleta?.apellido}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {item.plan?.nombre || 'Sin plan'}
            {item.categoria?.nombre ? ` \u2022 ${item.categoria.nombre}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 15 }}>{fmtMoney(item.montoFinal)}</Text>
          {item.descuentoAplicado > 0 && (
            <Text style={{ color: '#f59e0b', fontSize: 10 }}>-{fmtMoney(item.descuentoAplicado)} dto</Text>
          )}
          <View style={[s.badge, { backgroundColor: ec + '20' }]}>
            <Text style={{ color: ec, fontSize: 10, fontWeight: 'bold', textTransform: 'capitalize' }}>{item.estado}</Text>
          </View>
        </View>
      </DesignCard>
    );
  };

  return (
    <View style={s.tabPanel}>
      <ScrollView
        style={s.tabScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshingCuotas} onRefresh={onRefreshCuotas} tintColor={cc} colors={[cc]} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.sectionTitle, { color: theme.text }]}>Período</Text>
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={cc}
          contentStyle={s.monthRowInner}
          style={{ marginTop: 15, marginBottom: 10 }}
        >
          <TouchableOpacity onPress={onPrevMonth} accessibilityLabel="Mes anterior">
            <Ionicons name="chevron-back" size={24} color={cc} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>
            {MN[mes - 1]} {anio}
          </Text>
          <TouchableOpacity onPress={onNextMonth} accessibilityLabel="Mes siguiente">
            <Ionicons name="chevron-forward" size={24} color={cc} />
          </TouchableOpacity>
        </DesignCard>

        <View style={styles.resumenToggleRow}>
          <Text style={[s.sectionTitle, { color: theme.text, marginTop: 8, marginBottom: 0 }]}>Resumen</Text>
          <TouchableOpacity
            style={[styles.toggleBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={onToggleResumen}
          >
            <Ionicons name={showResumen ? 'eye-off-outline' : 'eye-outline'} size={16} color={cc} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
              {showResumen ? 'Ocultar' : 'Mostrar'}
            </Text>
          </TouchableOpacity>
        </View>

        {showResumen ? (
          <>
            <View style={s.statsRow}>
              <DesignCard
                theme={theme}
                isDarkMode={isDarkMode}
                accent={cc}
                style={s.statCard}
                contentStyle={s.statInner}
              >
                <Text style={{ color: cc, fontSize: 18, fontWeight: 'bold' }}>{fmtMoney(stats.totalFacturado)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>Facturado</Text>
              </DesignCard>
              <DesignCard
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#10b981"
                style={s.statCard}
                contentStyle={s.statInner}
              >
                <Text style={{ color: '#10b981', fontSize: 18, fontWeight: 'bold' }}>{fmtMoney(stats.totalCobrado)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>Cobrado</Text>
              </DesignCard>
            </View>
            <View style={s.statsRow}>
              <DesignCard
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#10b981"
                style={s.statCard}
                contentStyle={s.statMiniInner}
              >
                <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{stats.pagados || 0}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 10 }}>Pagados</Text>
              </DesignCard>
              <DesignCard
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#f59e0b"
                style={s.statCard}
                contentStyle={s.statMiniInner}
              >
                <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>{stats.pendientes || 0}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 10 }}>Pendientes</Text>
              </DesignCard>
              <DesignCard
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#ef4444"
                style={s.statCard}
                contentStyle={s.statMiniInner}
              >
                <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>{stats.vencidos || 0}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 10 }}>Vencidos</Text>
              </DesignCard>
            </View>
          </>
        ) : null}

        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 4 }]}>Acciones</Text>
        <TouchableOpacity style={[s.generateBtn, { backgroundColor: cc }]} onPress={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Generar cuotas del mes</Text>
            </>
          )}
        </TouchableOpacity>
        {autoGenerateNote ? (
          <Text style={[styles.cronHint, { color: theme.textMuted }]}>{autoGenerateNote}</Text>
        ) : null}

        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 8 }]}>Filtros</Text>
        <Text style={[s.label, { color: theme.textMuted }]}>Buscar atleta (nombre o apellido)</Text>
        <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor={theme.textMuted}
            value={filtroBusqueda}
            onChangeText={setFiltroBusqueda}
            autoCorrect={false}
          />
          {filtroBusqueda ? (
            <TouchableOpacity onPress={() => setFiltroBusqueda('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={[s.label, { color: theme.textMuted }]}>Estado de cuota</Text>
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

        <Text style={[s.sectionTitle, { color: theme.text }]}>Cuotas</Text>
        {isLoadingPay ? (
          <ActivityIndicator color={cc} style={{ marginTop: 20 }} />
        ) : payments.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={50} color={theme.icon} />
            <Text style={[s.emptyTxt, { color: theme.text }]}>Sin cuotas para este mes</Text>
            <Text style={[s.emptySub, { color: theme.textMuted }]}>Generá cuotas o probá otros filtros / mes.</Text>
          </View>
        ) : (
          payments.map((p) => renderPayment(p))
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  resumenToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  cronHint: { fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 4 },
};
