import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  STAFF_AGENDA_ROLES,
  STAFF_NEWS_AUTHOR_ROLES,
} from '../../constants/appRoles';
import { formatRolStaff } from './staffUtils';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';

export default function StaffDashboardScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [rol, setRol] = useState(null);
  const [firstName, setFirstName] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const r = await getToken('userRol');
        const n = await getToken('userNombre');
        setRol(r);
        setFirstName(n || '');
      })();
    }, []),
  );

  const showAgenda = rol && STAFF_AGENDA_ROLES.includes(rol);
  const showNewsComposer = rol && STAFF_NEWS_AUTHOR_ROLES.includes(rol);

  const Card = ({ icon, title, subtitle, onPress }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: colorMarca + '18' }]}>
        <Ionicons name={icon} size={26} color={colorMarca} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
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
        kicker="Equipo"
        title={firstName ? `Hola, ${firstName}` : 'Hola'}
        subtitle={clubData?.nombre || 'Tu club'}
        footer={
          rol ? (
            <CoachHeaderBadge>
              <Text style={styles.heroBadgeTxt}>{formatRolStaff(rol)}</Text>
            </CoachHeaderBadge>
          ) : null
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Accesos rápidos</Text>

        <Card
          icon="megaphone-outline"
          title="Comunicaciones"
          subtitle={
            showNewsComposer
              ? 'Ver avisos y publicar tus noticias cuando corresponda'
              : 'Novedades y avisos del club'
          }
          onPress={() => navigation.navigate('NoticiasStaff')}
        />

        {showAgenda ? (
          <Card
            icon="calendar-outline"
            title="Grilla semanal"
            subtitle="Horarios fijos por categoría"
            onPress={() => navigation.navigate('Agenda')}
          />
        ) : (
          <View style={[styles.mutedStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.icon} />
            <Text style={[styles.mutedStripTxt, { color: theme.textMuted }]}>
              La grilla de horarios aparece aquí solo para profes y preparadores físicos en esta primera versión.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: { flex: 1, marginHorizontal: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSubtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  mutedStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  mutedStripTxt: { flex: 1, fontSize: 13, lineHeight: 19 },
});
