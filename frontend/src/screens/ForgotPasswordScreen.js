import React, { useState, useContext, useCallback } from 'react';
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
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { clubApi } from '../utils/api';
import CustomAlert from '../components/CustomAlert';
import AuthFormLayout from '../components/AuthFormLayout';
import DesignCard from '../components/DesignCard';

const IS_WEB = Platform.OS === 'web';

export default function ForgotPasswordScreen({ navigation }) {
  const { clubData, clubHydrated } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSubmit = async () => {
    if (isLoading) return;
    if (!clubData?.urlIdentifier) {
      navigation.replace('WorkspaceSearch');
      return;
    }
    const emailValue = email.trim();
    if (!emailValue || !emailValue.includes('@')) {
      showAlert('Atención', 'Ingresá el email con el que te registraste en el club.');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await clubApi.post(
        '/auth/forgot-password',
        { email: emailValue },
        { headers: { 'x-club-identifier': clubData.urlIdentifier } },
      );
      showAlert(
        'Revisá tu email',
        data?.message ||
          'Si existe una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.',
        () => {
          setAlertConfig((p) => ({ ...p, visible: false }));
          navigation.navigate('Login');
        },
      );
    } catch (error) {
      showAlert(
        'No pudimos enviar el email',
        error.response?.data?.message || 'Revisá tu conexión e intentá de nuevo.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!clubHydrated || !clubData?.urlIdentifier) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  const accent = clubData.primaryColor || '#3b82f6';

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
          <Text style={[styles.title, { color: theme.text }]}>Olvidé mi contraseña</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Te enviamos un enlace a tu email para elegir una nueva contraseña. Si entrás con
            usuario (sin email), pedile el cambio a la administración del club.
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDarkMode ? '#1a191f' : theme.background,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="tu@email.com"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            {...(IS_WEB ? { nativeID: 'forgot-email', autoComplete: 'email' } : { autoComplete: 'email' })}
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
              <Text style={styles.buttonText}>Enviar enlace</Text>
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
    marginBottom: 18,
  },
  button: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  backBtn: { marginTop: 18, alignItems: 'center' },
  backText: { fontSize: 14, fontWeight: '600' },
});
