import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemeContext } from '../../context/ThemeContext';
import { ClubContext } from '../../context/ClubContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import ButtonDotsLoader from '../../components/ButtonDotsLoader';
import { parsePartnerMonto, formatPartnerMoney } from '../../utils/partnerSalePrice';

export default function PartnerSaleScreen() {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const cc = clubData?.primaryColor || '#3b82f6';
  const [dni, setDni] = useState('');
  const [member, setMember] = useState(null);
  const [monto, setMonto] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null);

  const showAlert = (title, message) => setAlert({ title, message });
  const parsedMonto = parsePartnerMonto(monto);

  const authHeaders = async () => {
    const token = await getToken('userToken');
    return {
      Authorization: `Bearer ${token}`,
      'x-club-identifier': clubData?.urlIdentifier,
    };
  };

  const onChangeDni = (value) => {
    const next = String(value || '').replace(/\D/g, '').slice(0, 11);
    setDni(next);
    if (member) setMember(null);
  };

  const searchByDni = async () => {
    const digits = dni.trim();
    if (digits.length < 6) return showAlert('DNI', 'Ingresá un DNI válido.');
    setSearching(true);
    setMember(null);
    try {
      const headers = await authHeaders();
      const { data } = await clubApi.get('/loyalty/partner/lookup', {
        headers,
        params: { dni: digits },
      });
      setMember(data?.user || null);
    } catch (e) {
      showAlert('Buscar', e.response?.data?.message || e.message || 'No se encontró el socio.');
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!member?._id) return showAlert('Socio', 'Buscá un socio por DNI primero.');
    const amount = parsePartnerMonto(monto);
    if (amount == null || String(monto).trim() === '') {
      return showAlert('Monto', 'Monto inválido.');
    }
    setBusy(true);
    try {
      const headers = await authHeaders();
      const { data } = await clubApi.post(
        '/loyalty/partner/sales',
        { dni: dni.trim(), monto: amount },
        { headers },
      );
      showAlert('Venta', data.message || 'Registrada.');
      setMonto('');
      setDni('');
      setMember(null);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo registrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.pad}>
        <Text style={[styles.title, { color: theme.text }]}>Registrar venta</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          Buscá al socio por DNI y registrá el monto para otorgar créditos.
        </Text>

        <Text style={[styles.label, { color: theme.textMuted }]}>DNI</Text>
        <View style={styles.row}>
          <TextInput
            value={dni}
            onChangeText={onChangeDni}
            keyboardType="number-pad"
            placeholder="Documento del socio"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              styles.inputGrow,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
            returnKeyType="search"
            onSubmitEditing={searchByDni}
          />
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: cc, opacity: searching ? 0.7 : 1 }]}
            onPress={searchByDni}
            disabled={searching}
          >
            {searching ? (
              <ButtonDotsLoader color="#fff" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {member ? (
          <View style={[styles.memberCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.memberIcon, { backgroundColor: `${cc}22` }]}>
              <Ionicons name="person" size={22} color={cc} />
            </View>
            <View style={styles.memberInfo}>
              <Text style={[styles.memberName, { color: theme.text }]}>
                {member.nombre} {member.apellido}
              </Text>
              <Text style={[styles.memberMeta, { color: theme.textMuted }]}>
                DNI {member.dni || dni}
                {member.puntosLealtad != null ? ` · ${member.puntosLealtad} créditos` : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.textMuted }]}>Monto ($)</Text>
        <TextInput
          value={monto}
          onChangeText={setMonto}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.textMuted}
          editable={!!member}
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              color: theme.text,
              opacity: member ? 1 : 0.55,
            },
          ]}
        />

        {member && parsedMonto != null && String(monto).trim() !== '' ? (
          <View
            style={[
              styles.priceBox,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.priceRow}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>Precio final</Text>
              <Text style={{ color: cc, fontWeight: '800', fontSize: 18 }}>
                ${formatPartnerMoney(parsedMonto)}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: cc, opacity: busy || !member ? 0.7 : 1 }]}
          onPress={submit}
          disabled={busy || !member}
        >
          {busy ? <ButtonDotsLoader color="#fff" /> : <Text style={styles.btnTxt}>Registrar</Text>}
        </TouchableOpacity>
      </View>
      <CustomAlert visible={!!alert} title={alert?.title} message={alert?.message} onConfirm={() => setAlert(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    marginBottom: 12,
  },
  inputGrow: { flex: 1, marginBottom: 0 },
  searchBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  memberIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '700' },
  memberMeta: { fontSize: 13, marginTop: 2 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  priceBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
