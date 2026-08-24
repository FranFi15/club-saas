import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBadgesOptional } from '../context/BadgeContext';
import NotificationsModal from './NotificationsModal';

/**
 * Campana para la barra del header (rightAccessory / toolbar).
 */
export default function NotificationBell({ size = 22 }) {
  const badges = useBadgesOptional();
  const [open, setOpen] = useState(false);
  const unread = badges?.notificationsUnread ?? 0;

  if (!badges) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'
        }
      >
        <Ionicons name="notifications-outline" size={size} color="#fff" />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{unread > 10 ? '+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <NotificationsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
});
