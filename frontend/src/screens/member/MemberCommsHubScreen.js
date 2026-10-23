import React, { useContext } from 'react';
import { StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import HubMenuCard from '../../components/HubMenuCard';
import EventDoorCard from '../../components/EventDoorCard';
import { useBadges } from '../../context/BadgeContext';
import { useMercadoPagoLinked } from '../../hooks/useMercadoPagoLinked';

export default function MemberCommsHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor } = useMember();
  const { hub } = useBadges();
  const mpLinked = useMercadoPagoLinked();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

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
            ? 'Documentación y material para tu familiar'
            : clubData?.nombre
              ? `${clubData.nombre} · Documentación y recursos`
              : 'Documentación y material del club'
        }
      />
      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} /> : null}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <EventDoorCard navigation={navigation} />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="chatbubbles-outline"
          title="Chat"
          subtitle={
            isTutor
              ? 'Mensajes con admin y profesionales de tus atletas'
              : 'Mensajes con administración y profesionales del club'
          }
          badge={hub('chat')}
          onPress={() => navigation.navigate('ChatInbox')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="newspaper-outline"
          title="Noticias"
          subtitle="Avisos publicados por el club y tu categoría"
          badge={hub('novedades')}
          onPress={() => navigation.navigate('MemberNews')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="document-attach-outline"
          title="Documentación"
          subtitle="Archivos que te pidieron subir (apto, autorizaciones, etc.)"
          badge={hub('documentacion')}
          onPress={() => navigation.navigate('MemberDocuments')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="folder-open-outline"
          title="Recursos"
          subtitle="Material compartido: PDFs, fotos y enlaces"
          badge={hub('recursos')}
          onPress={() => navigation.navigate('MemberResources')}
        />
        {mpLinked ? (
          <HubMenuCard
            theme={theme}
            colorMarca={colorMarca}
            icon="calendar-outline"
            title="Eventos"
            subtitle="Comprá entradas y mirá tus QR"
            onPress={() => navigation.navigate('MemberEvents')}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
});
