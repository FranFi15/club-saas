import React, { useContext, useCallback, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadges } from '../../context/BadgeContext';
import HubMenuCard from '../../components/HubMenuCard';
import NotificationBell from '../../components/NotificationBell';
import { getToken } from '../../utils/storage';
import { isClubOwnerRole } from '../../constants/appRoles';

const OWNER_ITEMS = [
  {
    title: 'Pendientes',
    subtitle: 'Transferencias, docs, solicitudes, alquileres y chat',
    icon: 'file-tray-full',
    route: 'Pendientes',
    badgeKey: 'pendientes',
  },
  { title: 'Control de ingreso', subtitle: 'Escaneá el QR de socios y personal', icon: 'qr-code', route: 'EscanearIngreso' },
  { title: 'Alquiler de cancha', subtitle: 'Reservas externas y disponibilidad', icon: 'time', route: 'Alquileres', badgeKey: 'alquileres' },
  { title: 'Chat', subtitle: 'Mensajes con cualquier usuario del club', icon: 'chatbubbles', route: 'ChatInbox', badgeKey: 'chat' },
  { title: 'Muro de noticias', subtitle: 'Comunicados al club', icon: 'newspaper', route: 'Noticias' },
  { title: 'Pedir documentación', subtitle: 'Solicitá archivos a categorías o atletas', icon: 'document-text', route: 'PedirDocumentacion' },
  {
    title: 'Revisar documentación',
    subtitle: 'Aprobá o rechazá lo que subieron los atletas',
    icon: 'folder-open',
    route: 'RevisarDocumentacion',
    badgeKey: 'docsRevision',
  },
];

const OPS_ITEMS = [
  {
    title: 'Pendientes',
    subtitle: 'Transferencias, docs, solicitudes, alquileres y chat',
    icon: 'file-tray-full',
    route: 'Pendientes',
    badgeKey: 'pendientes',
  },
  { title: 'Chat', subtitle: 'Mensajes con cualquier usuario del club', icon: 'chatbubbles', route: 'ChatInbox', badgeKey: 'chat' },
  { title: 'Muro de noticias', subtitle: 'Comunicados al club', icon: 'newspaper', route: 'Noticias' },
  { title: 'Pedir documentación', subtitle: 'Solicitá archivos a categorías o atletas', icon: 'document-text', route: 'PedirDocumentacion' },
  {
    title: 'Revisar documentación',
    subtitle: 'Aprobá o rechazá lo que subieron los atletas',
    icon: 'folder-open',
    route: 'RevisarDocumentacion',
    badgeKey: 'docsRevision',
  },
];

export default function AdminGestionHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const { hub, refresh } = useBadges();
  const [viewerRol, setViewerRol] = useState('');
  const isClubOwner = isClubOwnerRole(viewerRol);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const items = isClubOwner ? OWNER_ITEMS : OPS_ITEMS;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={[styles.headerWrap, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: colorMarca }]}>
          <View style={styles.headerBell}>
            <NotificationBell />
          </View>
          <Text style={styles.headerKicker}>Gestión</Text>
          <Text style={styles.headerTitle}>
            {isClubOwner ? 'Operaciones del club' : 'Comunicación y documentos'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={2}>
            {clubData?.nombre || 'Tu club'}
          </Text>
        </View>
      </View>
      <ScrollView
        style={[styles.body, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map(({ title, subtitle, icon, route, badgeKey }) => (
          <HubMenuCard
            key={route}
            title={title}
            subtitle={subtitle}
            icon={icon}
            badge={badgeKey ? hub(badgeKey) : 0}
            theme={theme}
            colorMarca={colorMarca}
            onPress={() => navigation.navigate(route)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerWrap: { width: '100%', paddingTop: 8, paddingBottom: 4 },
  header: {
    borderRadius: 0,
    width: '100%',
    paddingHorizontal: 16,
    paddingRight: 52,
    paddingTop: 18,
    paddingBottom: 22,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#e5e7eb', fontSize: 14, marginTop: 8, lineHeight: 20 },
  headerBell: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2 },
  body: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
});
