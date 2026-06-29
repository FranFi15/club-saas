import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';

export default function CoachCommsHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const Row = ({ icon, title, subtitle, onPress }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
        <Ionicons name={icon} size={24} color={colorMarca} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={theme.icon} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Comunicar"
        title="Comunicaciones"
        subtitle={
          clubData?.nombre
            ? `${clubData.nombre} · Noticias y material para el plantel`
            : 'Noticias y material multimedia'
        }
      />
      <View style={styles.body}>
      <Row
        icon="newspaper-outline"
        title="Noticias y avisos"
        subtitle="Publicá comunicados con alcance por categoría o rol"
        onPress={() => navigation.navigate('NoticiasStaff')}
      />
      <Row
        icon="cloud-upload-outline"
        title="Material multimedia"
        subtitle="Videos o imágenes como recurso para un atleta o todo un grupo"
        onPress={() => navigation.navigate('CoachResourceSend')}
      />
      <Row
        icon="document-text-outline"
        title="Pedir documentación"
        subtitle="Solicitá un archivo a una categoría o a un atleta (apto, DNI, etc.)"
        onPress={() => navigation.navigate('CoachRequestDoc')}
      />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
});
