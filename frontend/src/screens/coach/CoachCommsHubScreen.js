import React, { useContext } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import HubMenuCard from '../../components/HubMenuCard';
import { useBadges } from '../../context/BadgeContext';

export default function CoachCommsHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { hub } = useBadges();
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
          clubData?.nombre
            ? `${clubData.nombre} · Noticias y material para el plantel`
            : 'Noticias y material multimedia'
        }
      />
      <View style={styles.body}>
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="chatbubbles-outline"
          title="Chat"
          subtitle="Mensajes con admin, tutores y atletas (si está habilitado)"
          badge={hub('chat')}
          onPress={() => navigation.navigate('ChatInbox')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="newspaper-outline"
          title="Noticias"
          subtitle="Publicá comunicados en el muro del club"
          onPress={() => navigation.navigate('NoticiasStaff')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
          icon="cloud-upload-outline"
          title="Material multimedia"
          subtitle="PDF, fotos o enlaces externos para un atleta o todo un grupo"
          onPress={() => navigation.navigate('CoachResourceSend')}
        />
        <HubMenuCard
          theme={theme}
          colorMarca={colorMarca}
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
});
