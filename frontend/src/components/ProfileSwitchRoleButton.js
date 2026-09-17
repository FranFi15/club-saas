import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStoredUserRoles } from '../utils/roleSession';
import { navigationRef } from '../navigation/navigationRef';

export default function ProfileSwitchRoleButton({ theme, colorMarca, onPress, style }) {
  const [multi, setMulti] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const roles = await getStoredUserRoles();
      if (!cancelled) setMulti(roles.length > 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!multi) return null;

  const handlePress =
    onPress ||
    (() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('SelectRole', { fromProfile: true });
      }
    });

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          borderColor: colorMarca || theme.border,
          backgroundColor: theme.surface,
        },
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <Ionicons name="swap-horizontal" size={22} color={colorMarca || theme.text} />
      <Text style={[styles.txt, { color: theme.text }]}>Cambiar rol</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  txt: { fontWeight: '700', fontSize: 16 },
});
