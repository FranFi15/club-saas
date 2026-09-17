import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { EST_COLOR, fmtMoney } from '../screens/admin/finanzas/finanzasConstants';

/**
 * Resumen de cuotas que se van a pagar (lista + total).
 */
export default function PaymentPaySummary({
  title,
  subtitle,
  payments = [],
  getLineLabel,
  theme,
  primaryColor,
  maxListHeight = 200,
  listLabel = 'Vas a pagar',
  showTotal = true,
}) {
  const items = payments.filter(Boolean);
  const total = items.reduce((s, p) => s + (p.montoFinal || 0), 0);
  const totalOriginal = items.reduce((s, p) => s + (p.montoOriginal ?? p.montoFinal ?? 0), 0);
  const totalDto = items.reduce((s, p) => s + (p.descuentoAplicado || 0), 0);

  if (!items.length) return null;

  return (
    <View style={[styles.box, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {title ? (
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.sub, { color: theme.textMuted }]}>{subtitle}</Text>
      ) : null}

      <Text style={[styles.sectionLbl, { color: theme.textMuted }]}>{listLabel}</Text>

      <ScrollView
        style={[styles.list, { maxHeight: maxListHeight }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={items.length > 4}
      >
        {items.map((p) => {
          const ec = EST_COLOR[p.estado] || '#999';
          const label = getLineLabel ? getLineLabel(p) : p.plan?.nombre || 'Cuota';
          const hasDto = (p.descuentoAplicado || 0) > 0;
          return (
            <View key={String(p._id)} style={[styles.row, { borderColor: theme.border }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }} numberOfLines={2}>
                  {label}
                </Text>
                {p.estado ? (
                  <Text style={{ color: ec, fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' }}>
                    {p.estado}
                    {(p.recargoAplicado || 0) > 0 ? ` · recargo ${fmtMoney(p.recargoAplicado)}` : ''}
                    {hasDto ? ` · dto ${fmtMoney(p.descuentoAplicado)}` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {hasDto && (p.montoOriginal || 0) > (p.montoFinal || 0) ? (
                  <Text
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      textDecorationLine: 'line-through',
                    }}
                  >
                    {fmtMoney(p.montoOriginal)}
                  </Text>
                ) : null}
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                  {fmtMoney(p.montoFinal)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {showTotal ? (
        <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
          <View>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Total a cobrar</Text>
            {totalDto > 0 ? (
              <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                −{fmtMoney(totalDto)} descuento
                {totalOriginal > total ? ` (de ${fmtMoney(totalOriginal)})` : ''}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }}>{fmtMoney(total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 5,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  sectionLbl: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  list: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4,
  },
});
