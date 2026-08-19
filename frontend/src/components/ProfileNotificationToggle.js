import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { profileCardStyles } from './ProfileInfoRow';
import CustomAlert from './CustomAlert';
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionStatus,
  isPushEnabledByUser,
  isPushSupportedOnDevice,
} from '../services/pushNotifications';

export default function ProfileNotificationToggle() {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const loadState = useCallback(async () => {
    if (!isPushSupportedOnDevice()) {
      setLoading(false);
      return;
    }
    const userEnabled = await isPushEnabledByUser();
    const permission = await getNotificationPermissionStatus();
    setEnabled(userEnabled && permission === 'granted');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  if (!isPushSupportedOnDevice()) return null;

  const showAlert = (title, message, onConfirm) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
        onConfirm?.();
      },
    });
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleToggle = async (next) => {
    if (busy || !clubData?.urlIdentifier) return;
    setBusy(true);
    try {
      if (next) {
        const permission = await getNotificationPermissionStatus();
        if (permission === 'denied') {
          showAlert(
            'Permiso bloqueado',
            'Activá las notificaciones desde los ajustes del celular.',
            openSettings,
          );
          return;
        }
        const token = await enablePushNotifications(clubData.urlIdentifier);
        const finalPermission = await getNotificationPermissionStatus();
        const ok = Boolean(token) || finalPermission === 'granted';
        setEnabled(ok);
        if (!ok) {
          showAlert(
            'No se pudo activar',
            'No pudimos habilitar las notificaciones. Revisá los permisos del sistema.',
          );
        }
      } else {
        await disablePushNotifications(clubData.urlIdentifier);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View
        style={[
          profileCardStyles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            gap: 12,
          },
        ]}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.icon} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Notificaciones</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
            Avisos de cuotas, entrenamientos y novedades del club
          </Text>
        </View>
        {loading || busy ? (
          <ActivityIndicator color={colorMarca} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: theme.border, true: colorMarca + '88' }}
            thumbColor={enabled ? colorMarca : theme.textMuted}
          />
        )}
      </View>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </>
  );
}
