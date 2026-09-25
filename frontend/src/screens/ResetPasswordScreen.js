import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { clubApi, superAdminApi } from '../utils/api';
import CustomAlert from '../components/CustomAlert';
import AuthFormLayout from '../components/AuthFormLayout';
import DesignCard from '../components/DesignCard';

const IS_WEB = Platform.OS === 'web';

export default function ResetPasswordScreen({ navigation, route }) {
  const initialToken = String(route.params?.token || '').trim();
  const clubFromLink = String(route.params?.club || '').trim().toLowerCase();

  const { clubData, setClubData, clubHydrated } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [clubReady, setClubReady] = useState(!clubFromLink);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = useCallback((title, message, onConfirm) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm:
        onConfirm ||
        (() => setAlertConfig((prev) => ({ ...prev, visible: false }))),
    });
  }, []);

  useEffect(() => {
    if (initialToken) setToken(initialToken);
  }, [initialToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clubFromLink) {
        setClubReady(true);
        return;
      }
      if (clubData?.urlIdentifier === clubFromLink) {
        setClubReady(true);
        return;
      }
      try {
        const response = await superAdminApi.get(`/clubs/public/${clubFromLink}`);
        if (!cancelled) {
          await setClubData(response.data);
          setClubReady(true);
        }
      } catch {
        if (!cancelled) {
          setClubReady(true);
          showAlert(
            'Club no encontrado',
            'No pudimos cargar el club del enlace. Abrí la app, elegí el club e intentá de nuevo.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubFromLink, clubData?.urlIdentifier, setClubData, showAlert]);

  const handleSubmit = async () => {
    if (isLoading) return;
    const clubId = clubData?.urlIdentifier || clubFromLink;
    if (!clubId) {
      showAlert('Atención', 'Falta el club. Abrí el enlace del email o elegí el club primero.');
      return;
    }
    const t = token.trim();
    if (!t) {
      showAlert('Atención', 'Falta el token del enlace. Abrí el link del email completo.');
      return;
    }
    if (password.length < 6) {
      showAlert('Atención', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      showAlert('Atención', 'Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await clubApi.post(
        '/auth/reset-password',
        { token: t, password },
        { headers: { 'x-club-identifier': clubId } },
      );
      showAlert('Listo', data?.message || 'Contraseña actualizada. Ya podés iniciar sesión.', () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        navigation.replace('Login');
      });
    } catch (error) {
      showAlert(
        'No se pudo actualizar',
        error.response?.data?.message || 'El enlace puede haber vencido. Pedí uno nuevo.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!clubHydrated || !clubReady) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  const accent = clubData?.primaryColor || '#3b82f6';

  return (
    <>
      <AuthFormLayout backgroundColor={theme.background}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={accent}
          contentStyle={styles.cardBody}
          style={styles.cardWrap}
        >
          <Text style={[styles.title, { color: theme.text }]}>Nueva contraseña</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Elegí una contraseña nueva para tu cuenta
            {clubData?.nombre ? ` en ${clubData.nombre}` : ''}.
          </Text>

          {!initialToken ? (
            <>
              <Text style={[styles.label, { color: theme.text }]}>Código del email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#1a191f' : theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Pegá el token del enlace"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={token}
                onChangeText={setToken}
                editable={!isLoading}
              />
            </>
          ) : null}

          <Text style={[styles.label, { color: theme.text }]}>Nueva contraseña</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[
                styles.input,
                styles.passwordInput,
                {
                  backgroundColor: isDarkMode ? '#1a191f' : theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
              {...(IS_WEB
                ? { autoComplete: 'new-password', nativeID: 'reset-password' }
                : { autoComplete: 'new-password', textContentType: 'newPassword' })}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={theme.textMuted}
              />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Confirmar contraseña</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDarkMode ? '#1a191f' : theme.background,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Repetí la contraseña"
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            value={confirm}
            onChangeText={setConfirm}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            {...(IS_WEB ? { autoComplete: 'new-password' } : { autoComplete: 'new-password' })}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: accent, opacity: isLoading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Guardar contraseña</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.backBtn}
            disabled={isLoading}
            hitSlop={8}
          >
            <Text style={[styles.backText, { color: theme.textMuted }]}>Volver al inicio de sesión</Text>
          </TouchableOpacity>
        </DesignCard>
      </AuthFormLayout>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardWrap: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  cardBody: { padding: 22 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 12, top: 14 },
  button: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  backBtn: { marginTop: 18, alignItems: 'center' },
  backText: { fontSize: 14, fontWeight: '600' },
});
