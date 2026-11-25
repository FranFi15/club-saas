import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ThemeContext } from '../../context/ThemeContext';
import { ClubContext } from '../../context/ClubContext';
import { getToken } from '../../utils/storage';

export default function PartnerProfileScreen() {
  const navigation = useNavigation();
  const { theme } = useContext(ThemeContext);
  const { clearSession, setClubData, clubData } = useContext(ClubContext);
  const [name, setName] = React.useState('Partner');

  React.useEffect(() => {
    (async () => {
      const n = await getToken('userNombre');
      const a = await getToken('userApellido');
      const full = [n, a].filter(Boolean).join(' ');
      if (full) setName(full);
    })();
  }, []);

  const logout = async () => {
    await clearSession?.();
    setClubData?.(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.pad}>
        <Text style={[styles.title, { color: theme.text }]}>{name}</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          {clubData?.nombre || 'Club'} · Partner
        </Text>
        <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={logout}>
          <Text style={[styles.btnTxt, { color: theme.text }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { marginTop: 6, marginBottom: 24 },
  btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnTxt: { fontWeight: '600' },
});
