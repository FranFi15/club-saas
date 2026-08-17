import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { getToken, saveToken } from '../utils/storage';
import { clearAuthSession } from '../utils/session';
import { clubApi } from '../utils/api';
import { resolveMainNavigator } from '../constants/appRoles';
import {
  TERMS_VERSION,
  TERMS_SECTIONS,
  TERMS_URL,
  PRIVACY_URL,
} from '../constants/legal';
import CustomAlert from '../components/CustomAlert';

export default function TermsAcceptanceScreen({ navigation }) {
  const { clubData, setClubData, setSessionActive, setMemberSessionRol } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((prev) => ({ ...prev, visible: false })),
    });
  };

  const openUrl = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('Enlace', 'No se pudo abrir el enlace.');
    }
  };

  const handleChangeClub = async () => {
    await setClubData(null);
    await clearAuthSession();
    setMemberSessionRol(null);
    setSessionActive(false);
    navigation.replace('WorkspaceSearch');
  };

  const handleContinue = async () => {
    if (!accepted || saving) return;
    if (!clubData?.urlIdentifier) {
      showAlert('Error', 'No hay club seleccionado.');
      return;
    }

    setSaving(true);
    try {
      await clubApi.post(
        '/auth/accept-terms',
        { version: TERMS_VERSION },
        { headers: { 'x-club-identifier': clubData.urlIdentifier } },
      );
      await saveToken('acceptedTermsVersion', TERMS_VERSION);
      const rol = await getToken('userRol');
      navigation.replace(resolveMainNavigator(rol));
    } catch (e) {
      showAlert(
        'No se pudo guardar',
        e.response?.data?.message || 'Revisá tu conexión e intentá de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <View style={[styles.hero, { backgroundColor: colorMarca }]}>
        <TouchableOpacity
          onPress={handleChangeClub}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Cambiar de club"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.heroKicker}>Hermes Club App</Text>
        <Text style={styles.heroTitle}>Términos y condiciones</Text>
        <Text style={styles.heroSub}>
          {clubData?.nombre ? `${clubData.nombre} · ` : ''}Versión {TERMS_VERSION} · Argentina
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.intro, { color: theme.textMuted }]}>
          Para continuar, leé y aceptá los términos del servicio y la política de privacidad.
        </Text>

        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: theme.textMuted }]}>{section.body}</Text>
          </View>
        ))}

        <TouchableOpacity onPress={() => openUrl(PRIVACY_URL)} style={styles.linkRow}>
          <Ionicons name="open-outline" size={16} color={colorMarca} />
          <Text style={[styles.linkTxt, { color: colorMarca }]}>Política de privacidad</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openUrl(TERMS_URL)} style={styles.linkRow}>
          <Ionicons name="open-outline" size={16} color={colorMarca} />
          <Text style={[styles.linkTxt, { color: colorMarca }]}>Ver en la web</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAccepted((v) => !v)}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: accepted ? colorMarca : theme.border,
                backgroundColor: accepted ? colorMarca : 'transparent',
              },
            ]}
          >
            {accepted ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
          <Text style={[styles.checkTxt, { color: theme.text }]}>
            Leí y acepto los Términos y la Política de privacidad
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: colorMarca, opacity: !accepted || saving ? 0.45 : 1 },
          ]}
          onPress={handleContinue}
          disabled={!accepted || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaTxt}>Continuar</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  sectionBody: { fontSize: 14, lineHeight: 21 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  linkTxt: { fontSize: 14, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkTxt: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
