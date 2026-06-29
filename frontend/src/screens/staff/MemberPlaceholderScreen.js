import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
/** Tutores / otros roles miembro hasta que tengamos su módulo. Los atletas usan AthleteHome. */
export default function MemberPlaceholderScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';

  const leave = async () => {
    await clearSession();
    setClubData(null);
    navigation.replace('WorkspaceSearch');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: `${cc}20` }]}>
          <Ionicons name="hammer-outline" size={40} color={cc} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Próximamente</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          Esta versión todavía no incluye el panel para tutores u otros perfiles de miembro en el club{' '}
          {clubData?.nombre ? `"${clubData.nombre}"` : ''}. Los atletas ya pueden ingresar con su cuenta. Volvé cuando el
          equipo habilite tu acceso.
        </Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: cc }]} onPress={leave}>
          <Text style={styles.btnTxt}>Cambiar de club / salir</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginTop: 22, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 14 },
  btn: { marginTop: 28, paddingVertical: 14, paddingHorizontal: 26, borderRadius: 12 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
