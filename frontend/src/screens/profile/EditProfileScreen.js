import React, { useContext, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { MemberContext } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { displayDateToIsoCalendar, isoCalendarDateToDisplay, maskDateDDMMAAAA } from '../../utils/dateDisplay';
import { persistUserTokensFromProfile } from '../../utils/profileTokens';
import ProfilePhotoField from '../../components/ProfilePhotoField';
import { readScreenCache, useCachedFocusLoad, writeScreenCache } from '../../hooks/useCachedFocusLoad';
import { ADMIN_APP_ROLES, isClubOwnerRole } from '../../constants/appRoles';

const SHOW_DNI_ROLES = new Set(['atleta', 'tutor']);

function emptyBankForm() {
  return { titular: '', banco: '', cbu: '', alias: '' };
}

function bankFormFromApi(data) {
  return {
    titular: data?.titular || '',
    banco: data?.banco || '',
    cbu: data?.cbu || '',
    alias: data?.alias || '',
  };
}

function profileFormFromApi(data) {
  return {
    rol: data.rol || '',
    email: data.email || '',
    nombre: data.nombre || '',
    apellido: data.apellido || '',
    dni: data.dni || '',
    fechaNacimiento: data.fechaNacimiento ? isoCalendarDateToDisplay(String(data.fechaNacimiento)) : '',
    telefono: data.telefono || '',
    direccion: data.direccion || '',
    contactoEmergencia: data.contactoEmergencia || '',
    obraSocial: data.obraSocial || '',
    fotoPerfil: data.fotoPerfil || '',
  };
}

export default function EditProfileScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const memberCtx = useContext(MemberContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const profileCacheKey = clubData?.urlIdentifier ? `user-profile:${clubData.urlIdentifier}` : '';
  const initialCached = profileCacheKey ? readScreenCache(profileCacheKey) : null;
  const initialForm = initialCached?.profile ? profileFormFromApi(initialCached.profile) : null;

  const [saving, setSaving] = useState(false);
  const [rol, setRol] = useState(initialForm?.rol ?? '');
  const [email, setEmail] = useState(initialForm?.email ?? '');
  const [nombre, setNombre] = useState(initialForm?.nombre ?? '');
  const [apellido, setApellido] = useState(initialForm?.apellido ?? '');
  const [dni, setDni] = useState(initialForm?.dni ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(initialForm?.fechaNacimiento ?? '');
  const [telefono, setTelefono] = useState(initialForm?.telefono ?? '');
  const [direccion, setDireccion] = useState(initialForm?.direccion ?? '');
  const [contactoEmergencia, setContactoEmergencia] = useState(initialForm?.contactoEmergencia ?? '');
  const [obraSocial, setObraSocial] = useState(initialForm?.obraSocial ?? '');
  const [fotoPerfil, setFotoPerfil] = useState(initialForm?.fotoPerfil ?? '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [bankTitular, setBankTitular] = useState(initialCached?.bank?.titular ?? '');
  const [bankBanco, setBankBanco] = useState(initialCached?.bank?.banco ?? '');
  const [bankCbu, setBankCbu] = useState(initialCached?.bank?.cbu ?? '');
  const [bankAlias, setBankAlias] = useState(initialCached?.bank?.alias ?? '');
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message, onConfirm) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        onConfirm?.();
      },
    });
  };

  const applyForm = useCallback((data) => {
    const form = profileFormFromApi(data.profile);
    setRol(form.rol);
    setEmail(form.email);
    setNombre(form.nombre);
    setApellido(form.apellido);
    setDni(form.dni);
    setFechaNacimiento(form.fechaNacimiento);
    setTelefono(form.telefono);
    setDireccion(form.direccion);
    setContactoEmergencia(form.contactoEmergencia);
    setObraSocial(form.obraSocial);
    setFotoPerfil(form.fotoPerfil);
    if (data.bank) {
      const bank = bankFormFromApi(data.bank);
      setBankTitular(bank.titular);
      setBankBanco(bank.banco);
      setBankCbu(bank.cbu);
      setBankAlias(bank.alias);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const { data } = await clubApi.get('/users/me', { headers: h });
    let bank = null;
    if (ADMIN_APP_ROLES.includes(data.rol)) {
      const bankRes = await clubApi.get('/financial/transfer-bank', { headers: h });
      bank = bankRes.data?.datosTransferencia || emptyBankForm();
    }
    return { profile: data, rol: data.rol || '', bank };
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: profileCacheKey,
    enabled: !!profileCacheKey,
    fetchData: fetchProfile,
    onFetched: applyForm,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar tu perfil.');
    },
  });

  const showInitialLoader = loading && !nombre && !apellido;
  const canEditClubBank = isClubOwnerRole(rol);
  const submit = async () => {
    if (!nombre.trim() || !apellido.trim()) {
      showAlert('Atención', 'Nombre y apellido son obligatorios.');
      return;
    }
    let fechaIso = null;
    if (fechaNacimiento.trim()) {
      fechaIso = displayDateToIsoCalendar(fechaNacimiento.trim());
      if (!fechaIso) {
        showAlert('Fecha', 'Usá el formato DD-MM-AAAA para la fecha de nacimiento.');
        return;
      }
    }
    if (password || password2) {
      if (password.length < 6) {
        showAlert('Contraseña', 'La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (password !== password2) {
        showAlert('Contraseña', 'Las contraseñas no coinciden.');
        return;
      }
    }

    setSaving(true);
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const body = {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        contactoEmergencia: contactoEmergencia.trim(),
        obraSocial: obraSocial.trim(),
        fotoPerfil: fotoPerfil.trim(),
      };
      if (SHOW_DNI_ROLES.has(rol)) {
        body.dni = dni.trim();
        body.fechaNacimiento = fechaIso || null;
      }
      if (password) body.password = password;

      const { data } = await clubApi.patch('/users/profile', body, { headers: h });
      if (canEditClubBank) {
        await clubApi.patch(
          '/financial/transfer-bank',
          {
            titular: bankTitular.trim(),
            banco: bankBanco.trim(),
            cbu: bankCbu.trim(),
            alias: bankAlias.trim(),
          },
          { headers: h },
        );
      }
      await persistUserTokensFromProfile(data);
      if (profileCacheKey) {
        writeScreenCache(profileCacheKey, {
          profile: data,
          rol: data.rol || '',
          bank: canEditClubBank
            ? {
                titular: bankTitular.trim(),
                banco: bankBanco.trim(),
                cbu: bankCbu.trim(),
                alias: bankAlias.trim(),
              }
            : null,
        });
      }
      if (memberCtx?.refresh) await memberCtx.refresh({ background: true });
      showAlert('Listo', 'Tus datos quedaron actualizados.', () => navigation.goBack());
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }];
  const showIdentityExtra = SHOW_DNI_ROLES.has(rol);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Perfil"
        title="Editar datos"
        subtitle={canEditClubBank ? 'Datos personales y bancarios del club' : 'Datos personales de tu cuenta'}
        onBack={() => navigation.goBack()}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
        >
          <ProfilePhotoField
            value={fotoPerfil}
            onChange={setFotoPerfil}
            clubData={clubData}
            colorMarca={colorMarca}
            theme={theme}
            nombre={nombre}
            apellido={apellido}
          />
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            El email no se puede cambiar desde acá. Contactá al club si necesitás otro correo.
          </Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>Email</Text>
          <TextInput
            style={[inputStyle, styles.readOnly]}
            value={email}
            editable={false}
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>Nombre</Text>
          <TextInput style={inputStyle} value={nombre} onChangeText={setNombre} placeholderTextColor={theme.textMuted} />

          <Text style={[styles.label, { color: theme.text }]}>Apellido</Text>
          <TextInput style={inputStyle} value={apellido} onChangeText={setApellido} placeholderTextColor={theme.textMuted} />

          {showIdentityExtra ? (
            <>
              <Text style={[styles.label, { color: theme.text }]}>DNI</Text>
              <TextInput
                style={inputStyle}
                value={dni}
                onChangeText={setDni}
                keyboardType="number-pad"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.label, { color: theme.text }]}>Fecha de nacimiento</Text>
              <TextInput
                style={inputStyle}
                value={fechaNacimiento}
                onChangeText={(t) => setFechaNacimiento(maskDateDDMMAAAA(t))}
                placeholder="DD-MM-AAAA"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={10}
              />
            </>
          ) : null}

          <Text style={[styles.section, { color: theme.text }]}>Contacto</Text>
          <Text style={[styles.label, { color: theme.text }]}>Teléfono</Text>
          <TextInput
            style={inputStyle}
            value={telefono}
            onChangeText={setTelefono}
            keyboardType="phone-pad"
            placeholderTextColor={theme.textMuted}
          />
          <Text style={[styles.label, { color: theme.text }]}>Dirección</Text>
          <TextInput style={inputStyle} value={direccion} onChangeText={setDireccion} placeholderTextColor={theme.textMuted} />
          <Text style={[styles.label, { color: theme.text }]}>Contacto de emergencia</Text>
          <TextInput
            style={inputStyle}
            value={contactoEmergencia}
            onChangeText={setContactoEmergencia}
            placeholderTextColor={theme.textMuted}
          />
          <Text style={[styles.label, { color: theme.text }]}>Obra social</Text>
          <TextInput style={inputStyle} value={obraSocial} onChangeText={setObraSocial} placeholderTextColor={theme.textMuted} />

          {canEditClubBank ? (
            <>
              <Text style={[styles.section, { color: theme.text }]}>Datos bancarios para transferencias</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Estos datos se muestran a tutores y atletas cuando pagan por transferencia.
              </Text>
              <Text style={[styles.label, { color: theme.text }]}>Titular de la cuenta</Text>
              <TextInput
                style={inputStyle}
                value={bankTitular}
                onChangeText={setBankTitular}
                placeholder="Nombre del titular"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.label, { color: theme.text }]}>Banco (opcional)</Text>
              <TextInput
                style={inputStyle}
                value={bankBanco}
                onChangeText={setBankBanco}
                placeholder="Ej. Banco Galicia"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.label, { color: theme.text }]}>Alias</Text>
              <TextInput
                style={inputStyle}
                value={bankAlias}
                onChangeText={setBankAlias}
                autoCapitalize="none"
                placeholder="Ej. club.deportivo.mp"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.label, { color: theme.text }]}>CBU</Text>
              <TextInput
                style={inputStyle}
                value={bankCbu}
                onChangeText={(t) => setBankCbu(t.replace(/\D/g, '').slice(0, 22))}
                keyboardType="number-pad"
                placeholder="22 dígitos"
                placeholderTextColor={theme.textMuted}
              />
            </>
          ) : null}

          <Text style={[styles.section, { color: theme.text }]}>Cambiar contraseña (opcional)</Text>
          <Text style={[styles.label, { color: theme.text }]}>Nueva contraseña</Text>
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={theme.textMuted}
          />
          <Text style={[styles.label, { color: theme.text }]}>Repetir contraseña</Text>
          <TextInput
            style={inputStyle}
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry
            placeholderTextColor={theme.textMuted}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
            onPress={submit}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Guardar cambios</Text>}
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  readOnly: { opacity: 0.75 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
