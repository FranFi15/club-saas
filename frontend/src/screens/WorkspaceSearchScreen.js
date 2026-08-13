import React, { useState, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Image,
  Platform,
} from 'react-native';
import { superAdminApi } from '../utils/api';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import AuthFormLayout from '../components/AuthFormLayout';
import { platformCardShadow } from '../utils/platformShadow';

const IS_WEB = Platform.OS === 'web';

function apiErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === 'ECONNABORTED') {
    return 'Está tardando más de lo normal. Probá de nuevo en un momento.';
  }
  if (error.message === 'Network Error' || !error.response) {
    return 'No hay conexión ahora. Revisá tu internet e intentá otra vez.';
  }
  return 'Revisá el código del club e intentá de nuevo.';
}

export default function WorkspaceSearchScreen({ navigation }) {
  const [identifier, setIdentifier] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setClubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = useCallback((title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((prev) => ({ ...prev, visible: false })),
    });
  }, []);

  const handleSearchClub = async () => {
    if (!identifier.trim()) {
      showAlert('Atención', 'Ingresá el código de tu club para continuar.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await superAdminApi.get(`/clubs/public/${identifier.trim().toLowerCase()}`);
      await setClubData(response.data);
      navigation.replace('Login');
    } catch (error) {
      showAlert('No se pudo ingresar', apiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AuthFormLayout backgroundColor={theme.background}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        <View style={styles.heroWrap}>
          <Image
            source={isDarkMode ? require('../../assets/4.png') : require('../../assets/3.png')}
            style={styles.heroImage}
            resizeMode="contain"
            accessibilityLabel="GPSports"
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Código de tu club..."
            placeholderTextColor={theme.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            returnKeyType="search"
            onSubmitEditing={handleSearchClub}
            blurOnSubmit={false}
            {...(IS_WEB ? { nativeID: 'workspace-club-code' } : {})}
          />

          <TouchableOpacity
            style={styles.buttonGeneric}
            onPress={handleSearchClub}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Ingresar</Text>
            )}
          </TouchableOpacity>
        </View>
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
  heroWrap: { alignItems: 'center', width: '100%' },
  heroImage: { width: 250, height: 250, marginBottom: 0 },
  card: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    ...platformCardShadow(6),
  },
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
  buttonGeneric: {
    width: '100%',
    height: 50,
    backgroundColor: '#16559b',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});
