import React, { useState, useContext, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { saveToken, getToken } from '../utils/storage';
import { beginAuthSession } from '../utils/session';
import { persistAuthTokens } from '../utils/authTokens';
import { clubApi } from '../utils/api';
import { resolveMainNavigator } from '../constants/appRoles';
import { registerPushTokenWithBackend } from '../services/pushNotifications';
import CustomAlert from '../components/CustomAlert';
import AuthFormLayout from '../components/AuthFormLayout';
import { platformCardShadow } from '../utils/platformShadow';

const IS_WEB = Platform.OS === 'web';

const emailAutoFill = Platform.select({
  ios: { textContentType: 'username', autoComplete: 'username' },
  android: { autoComplete: 'username', importantForAutofill: 'yes' },
  web: { autoComplete: 'username', name: 'username' },
  default: { autoComplete: 'username' },
});

const passwordAutoFill = Platform.select({
  ios: { textContentType: 'password', autoComplete: 'current-password' },
  android: { autoComplete: 'password', importantForAutofill: 'yes' },
  web: { autoComplete: 'current-password', name: 'password' },
  default: { autoComplete: 'current-password' },
});

export default function LoginScreen({ navigation }) {
  const {
    clubData,
    setClubData,
    setMemberSessionRol,
    setSessionActive,
    clubHydrated,
    sessionActive,
    sessionHydrated,
  } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const passwordRef = useRef(null);
  const emailValueRef = useRef('');
  const passwordValueRef = useRef('');
  const loginLockRef = useRef(false);
  const handleLoginRef = useRef(null);
  const autofillSubmitRef = useRef(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false, title: '', message: '', onConfirm: () => {}
  });

  useEffect(() => {
    getToken('userEmail').then((saved) => {
      if (saved) {
        emailValueRef.current = saved;
        setEmail(saved);
      }
    });
  }, []);

  const syncEmail = useCallback((text) => {
    emailValueRef.current = text;
    setEmail(text);
  }, []);

  const syncPassword = useCallback((text) => {
    passwordValueRef.current = text;
    setPassword(text);
  }, []);

  const submitIfAutofilled = useCallback(() => {
    const emailValue = emailValueRef.current.trim();
    const passwordValue = passwordValueRef.current;
    if (!emailValue || !passwordValue || loginLockRef.current || autofillSubmitRef.current) return;
    autofillSubmitRef.current = true;
    setTimeout(() => {
      autofillSubmitRef.current = false;
      handleLoginRef.current?.();
    }, 200);
  }, []);

  useEffect(() => {
    if (!sessionHydrated || !sessionActive) return;
    getToken('userRol').then((storedRol) => {
      if (storedRol) navigation.replace(resolveMainNavigator(storedRol));
    });
  }, [sessionHydrated, sessionActive, navigation]);

  useEffect(() => {
    if (clubHydrated && !clubData?.urlIdentifier) {
      navigation.replace('WorkspaceSearch');
    }
  }, [clubHydrated, clubData?.urlIdentifier, navigation]);

  const showAlert = useCallback((title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((prev) => ({ ...prev, visible: false })),
    });
  }, []);

  const handleLogin = async () => {
    if (loginLockRef.current || isLoading) return;
    if (!clubData?.urlIdentifier) {
      navigation.replace('WorkspaceSearch');
      return;
    }
    const emailValue = (emailValueRef.current || email).trim();
    const passwordValue = passwordValueRef.current || password;
    if (!emailValue || !passwordValue) {
      showAlert('Atención', 'Por favor completá tu email y contraseña.');
      return;
    }

    loginLockRef.current = true;
    setIsLoading(true);
    try {
      const response = await clubApi.post(
        '/auth/login',
        { email: emailValue, password: passwordValue },
        { headers: { 'x-club-identifier': clubData.urlIdentifier } }
      );

      const { token, refreshToken, rol, nombre, apellido, _id, fotoPerfil } = response.data;
      if (!token || !refreshToken) {
        showAlert('Error', 'El servidor no devolvió tokens de sesión. Reiniciá el backend.');
        return;
      }

      beginAuthSession();
      await persistAuthTokens({ token, refreshToken });
      await saveToken('userEmail', emailValue);
      if (rol) await saveToken('userRol', rol);
      if (nombre != null) await saveToken('userNombre', String(nombre));
      if (apellido != null) await saveToken('userApellido', String(apellido));
      if (_id != null) await saveToken('userId', String(_id));
      if (fotoPerfil != null) await saveToken('userFotoPerfil', String(fotoPerfil));

      setSessionActive(true);
      if (rol === 'atleta' || rol === 'tutor') {
        setMemberSessionRol(rol);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else {
        setMemberSessionRol(null);
      }

      registerPushTokenWithBackend(clubData.urlIdentifier);
      navigation.replace(resolveMainNavigator(rol));
    } catch (error) {
      console.log('Error de Axios:', error.message);
      console.log('Respuesta del servidor:', error.response?.data);
      showAlert('Acceso denegado', error.response?.data?.message || 'Error de conexión.');
    } finally {
      setIsLoading(false);
      loginLockRef.current = false;
    }
  };

  handleLoginRef.current = handleLogin;

  const handleChangeClub = async () => {
    await setClubData(null);
    navigation.replace('WorkspaceSearch');
  };

  if (!clubHydrated || !clubData?.urlIdentifier) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  const formBody = (
    <>
      <View style={styles.heroWrap}>
        {clubData.logoUrl ? (
          <Image source={{ uri: clubData.logoUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={[styles.placeholderLogo, { backgroundColor: clubData.primaryColor }]}>
            <Text style={styles.placeholderText}>{clubData.nombre.charAt(0)}</Text>
          </View>
        )}
      </View>

      <View
        style={[styles.card, { backgroundColor: theme.surface }]}
        importantForAutofill="yes"
        autoComplete="password"
      >
        <Text style={[styles.label, { color: theme.text }]}>Email</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
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
          onChangeText={syncEmail}
          onChange={(e) => syncEmail(e.nativeEvent.text)}
          onEndEditing={(e) => syncEmail(e.nativeEvent.text)}
          editable={!isLoading}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
          {...emailAutoFill}
          {...(IS_WEB ? { nativeID: 'login-email' } : {})}
        />

        <Text style={[styles.label, { color: theme.text }]}>Contraseña</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            ref={passwordRef}
            style={[
              styles.input,
              styles.passwordInput,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Tu contraseña"
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={syncPassword}
            onChange={(e) => syncPassword(e.nativeEvent.text)}
            onEndEditing={(e) => {
              syncPassword(e.nativeEvent.text);
              submitIfAutofilled();
            }}
            editable={!isLoading}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={submitIfAutofilled}
            {...passwordAutoFill}
            {...(IS_WEB ? { nativeID: 'login-password' } : {})}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword((v) => !v)}
            disabled={isLoading}
            hitSlop={8}
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.buttonGeneric, { backgroundColor: clubData.primaryColor }]}
          onPress={() => handleLoginRef.current?.()}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleChangeClub}
          style={styles.backButton}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={[styles.backButtonText, { color: theme.textMuted }]}>Cambiar de club</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <>
      <AuthFormLayout backgroundColor={theme.background}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {formBody}
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
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  heroWrap: { alignItems: 'center', width: '100%' },
  heroImage: { width: 250, height: 250, borderRadius: 125, marginBottom: 0 },
  placeholderLogo: {
    width: 250,
    height: 250,
    borderRadius: 125,
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center'
  },
  placeholderText: { fontSize: 96, color: '#ffffff', fontWeight: 'bold' },
  card: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    ...platformCardShadow(6),
  },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 12, alignSelf: 'flex-start' },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 20,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  passwordWrap: {
    width: '100%',
    position: 'relative',
    marginBottom: 20,
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  buttonGeneric: {
    width: '100%',
    height: 50,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 10 },
  backButtonText: { fontSize: 14, textDecorationLine: 'underline' }
});
