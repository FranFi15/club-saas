import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import BadgeDot from '../../components/BadgeDot';
import { useBadges } from '../../context/BadgeContext';

export default function MemberCommsHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor } = useMember();
  const { hub } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const Row = ({ icon, title, subtitle, onPress, badge = 0 }) => (
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
      <BadgeDot count={badge} />
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
          isTutor
            ? 'Novedades, documentación y material para tu familiar'
            : clubData?.nombre
              ? `${clubData.nombre} · Documentación y recursos`
              : 'Documentación y material del club'
        }
      />
      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} /> : null}
      <View style={styles.body}>
        <Row
          icon="newspaper-outline"
          title="Noticias"
          subtitle="Avisos del club, tu categoría y mensajes directos"
          badge={hub('novedades')}
          onPress={() => navigation.navigate('MemberNews')}
        />
        <Row
          icon="document-attach-outline"
          title="Documentación"
          subtitle="Archivos que te pidieron subir (apto, autorizaciones, etc.)"
          badge={hub('documentacion')}
          onPress={() => navigation.navigate('MemberDocuments')}
        />
        <Row
          icon="folder-open-outline"
          title="Recursos"
          subtitle="Material compartido: PDFs, rutinas, videos e imágenes"
          badge={hub('recursos')}
          onPress={() => navigation.navigate('MemberResources')}
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
