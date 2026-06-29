import React from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { finanzasStyles as s } from './finanzasStyles';

export default function HermanosTab({
  theme,
  primaryColor,
  siblings,
  globalDiscount,
  globalDiscountInput,
  onGlobalDiscountChange,
  onSaveGlobalDiscount,
  isSavingGlobalDiscount,
  discountInput,
  onDiscountChange,
  onApplyDiscount,
}) {
  const cc = primaryColor;

  const familyDiscountDisplay = (g) => {
    if (g.descuentoFamiliar != null && g.descuentoFamiliar !== '') return g.descuentoFamiliar;
    return Math.max(0, ...(g.hijos || []).map((h) => h.descuentoPorcentaje || 0));
  };

  return (
    <View style={s.tabPanel}>
      <ScrollView style={s.tabScroll} contentContainerStyle={{ paddingBottom: 30, paddingTop: 15 }} keyboardShouldPersistTaps="handled">
        <Text style={[s.sectionTitle, { color: theme.text }]}>Descuento global</Text>
        
        <View style={[styles.globalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.discountLabel, { color: theme.text }]}>Descuento por defecto (%)</Text>
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
          {globalDiscount > 0 ? (
            <Text style={[styles.globalHint, { color: theme.textMuted }]}>
              Activo: {globalDiscount}% para familias nuevas.
            </Text>
          ) : null}
        </View>

        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 8 }]}>Familias</Text>
        <Text style={[s.sectionSub, { color: theme.textMuted }]}>
          Cada tarjeta es una familia (mismo tutor). Editá el % solo si esta familia necesita un descuento distinto al
          global.
        </Text>
        {siblings.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={50} color={theme.icon} />
            <Text style={[s.emptyTxt, { color: theme.text }]}>Sin familias con tutor</Text>
            <Text style={[s.emptySub, { color: theme.textMuted }]}>
              Los atletas deben tener un tutor principal asignado en administración.
            </Text>
          </View>
        ) : (
          siblings.map((g) => {
            const tutorId = g.tutor._id;
            const pctActual = familyDiscountDisplay(g);
            const inputVal = discountInput[tutorId] ?? (pctActual ? String(pctActual) : '');

            return (
              <View
                key={tutorId}
                style={[styles.familyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={styles.familyHeader}>
                  <View style={[s.planIcon, { backgroundColor: '#8b5cf620' }]}>
                    <Ionicons name="people" size={20} color="#8b5cf6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>Familia</Text>
                    <Text style={[s.planName, { color: theme.text }]}>
                      {g.tutor.nombre} {g.tutor.apellido}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[s.badge, { backgroundColor: cc + '15' }]}>
                      <Text style={{ color: cc, fontSize: 11, fontWeight: 'bold' }}>
                        {g.hijos.length} atleta{g.hijos.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {g.descuentoEsPersonalizado ? (
                      <View style={[s.badge, { backgroundColor: '#f59e0b20' }]}>
                        <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: 'bold' }}>Personalizado</Text>
                      </View>
                    ) : pctActual > 0 && globalDiscount > 0 && pctActual === globalDiscount ? (
                      <View style={[s.badge, { backgroundColor: '#10b98120' }]}>
                        <Text style={{ color: '#10b981', fontSize: 10, fontWeight: 'bold' }}>Global</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {g.hijos.map((h) => (
                  <View key={h._id} style={styles.childRow}>
                    <Text style={{ color: theme.text, flex: 1, fontSize: 14 }}>
                      {h.nombre} {h.apellido}
                    </Text>
                    {h.descuentoPorcentaje > 0 ? (
                      <View style={[s.badge, { backgroundColor: '#10b98120' }]}>
                        <Text style={{ color: '#10b981', fontSize: 10, fontWeight: 'bold' }}>
                          {h.descuentoPorcentaje}% en cuota
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>Sin dto.</Text>
                    )}
                  </View>
                ))}

                <View style={[styles.discountBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={[styles.discountLabel, { color: theme.text }]}>Descuento familiar (%)</Text>
                  <Text style={[styles.discountHint, { color: theme.textMuted }]}>
                    {g.descuentoEsPersonalizado
                      ? 'Esta familia tiene un descuento distinto al global.'
                      : `Si no cambiás este valor, se usa el global (${globalDiscount}%).`}
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
                    <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 16 }}>%</Text>
                    <TouchableOpacity
                      style={[styles.applyBtn, { backgroundColor: '#8b5cf6' }]}
                      onPress={() => onApplyDiscount(tutorId)}
                    >
                      <Text style={styles.applyBtnTxt}>Guardar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  globalBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  globalHint: { fontSize: 12, marginTop: 8 },
  familyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  familyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 4,
  },
  discountBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  discountLabel: { fontSize: 14, fontWeight: '800' },
  discountHint: { fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 10 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discountInput: { flex: 1, marginBottom: 0, minWidth: 0 },
  applyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  applyBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
};
