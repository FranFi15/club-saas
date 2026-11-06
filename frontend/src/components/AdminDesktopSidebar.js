import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { getToken } from '../utils/storage';
import { canMutateAsAdmin, isDirigenteRole, isClubOpsRole } from '../constants/appRoles';
import { useMercadoPagoLinked } from '../hooks/useMercadoPagoLinked';
import { tabBadgeText } from '../utils/tabBadgeLabel';
import { useBadges } from '../context/BadgeContext';

const SIDEBAR_WIDTH = 252;

const TAB_ROOTS = {
  Estructura: 'EstructuraHome',
  Gestión: 'GestionMenu',
  Finanzas: 'FinanzasHome',
  Perfil: 'PerfilMain',
};

function buildSections(viewerRol, mpLinked) {
  const canWrite = canMutateAsAdmin(viewerRol);
  const isDirigente = isDirigenteRole(viewerRol);
  const showAdminCards = canWrite || isDirigente;

  const estructuraItems = [
    { label: 'Resumen', screen: 'EstructuraHome', icon: 'grid-outline' },
    { label: 'Estadísticas', screen: 'Estadisticas', icon: 'stats-chart-outline' },
    { label: 'Usuarios y staff', screen: 'Usuarios', icon: 'people-outline' },
    canWrite
      ? { label: 'Invitar familia', screen: 'InvitarFamilia', icon: 'link-outline' }
      : null,
    showAdminCards
      ? { label: 'Estructura deportiva', screen: 'EstructuraDeportiva', icon: 'trophy-outline' }
      : null,
    { label: 'Espacios físicos', screen: 'Espacios', icon: 'map-outline' },
    { label: 'Grilla', screen: 'Grilla', icon: 'calendar-outline' },
    canWrite
      ? {
          label: 'Solicitudes',
          screen: 'SolicitudesInscripcion',
          icon: 'person-add-outline',
          badgeKey: 'solicitudesInscripcion',
          badgeSource: 'hub',
        }
      : null,
  ].filter(Boolean);

  const gestionItems = [
    isDirigente
      ? null
      : {
          label: 'Pendientes',
          screen: 'Pendientes',
          icon: 'file-tray-full-outline',
          badgeKey: 'pendientes',
          badgeSource: 'hub',
        },
    { label: 'Control de ingreso', screen: 'EscanearIngreso', icon: 'qr-code-outline' },
    { label: 'Escanear evento', screen: 'EscanearEvento', icon: 'ticket-outline' },
    {
      label: 'Alquileres',
      screen: 'Alquileres',
      icon: 'time-outline',
      badgeKey: 'alquileres',
      badgeSource: 'hub',
    },
    mpLinked
      ? {
          label: 'Eventos',
          screen: 'Eventos',
          icon: 'calendar-outline',
          subtitle: isClubOpsRole(viewerRol) ? 'Vender entradas' : undefined,
        }
      : null,
    {
      label: 'Chat',
      screen: 'ChatInbox',
      icon: 'chatbubbles-outline',
      badgeKey: 'chat',
      badgeSource: 'hub',
    },
    { label: 'Noticias', screen: 'Noticias', icon: 'newspaper-outline' },
    isDirigente
      ? null
      : { label: 'Pedir documentación', screen: 'PedirDocumentacion', icon: 'document-text-outline' },
    isDirigente
      ? null
      : {
          label: 'Revisar documentación',
          screen: 'RevisarDocumentacion',
          icon: 'folder-open-outline',
          badgeKey: 'docsRevision',
          badgeSource: 'hub',
        },
  ].filter(Boolean);

  return [
    {
      tab: 'Estructura',
      label: 'Estructura',
      icon: 'business-outline',
      iconFocused: 'business',
      tabBadge: 'estructura',
      items: estructuraItems,
    },
    {
      tab: 'Gestión',
      label: 'Gestión',
      icon: 'briefcase-outline',
      iconFocused: 'briefcase',
      tabBadge: 'gestion',
      items: [
        { label: 'Resumen', screen: 'GestionMenu', icon: 'grid-outline' },
        ...gestionItems,
      ],
    },
    {
      tab: 'Finanzas',
      label: 'Finanzas',
      icon: 'cash-outline',
      iconFocused: 'cash',
      tabBadge: 'finanzas',
      items: [{ label: 'Panel', screen: 'FinanzasHome', icon: 'wallet-outline' }],
    },
    {
      tab: 'Perfil',
      label: 'Perfil',
      icon: 'person-outline',
      iconFocused: 'person',
      items: [
        { label: 'Mi perfil', screen: 'PerfilMain', icon: 'person-circle-outline' },
        { label: 'Editar perfil', screen: 'EditProfile', icon: 'create-outline' },
        { label: 'QR de ingreso', screen: 'ClubEntryQr', icon: 'qr-code-outline' },
      ],
    },
  ];
}

function activeRouteNames(tabState) {
  if (!tabState?.routes?.length) {
    return { tab: 'Estructura', screen: 'EstructuraHome' };
  }
  const tabRoute = tabState.routes[tabState.index] || tabState.routes[0];
  const nested = tabRoute.state;
  const nestedRoute = nested?.routes?.[nested.index ?? 0];
  return {
    tab: tabRoute.name,
    screen: nestedRoute?.name || TAB_ROOTS[tabRoute.name] || null,
  };
}

function SidebarItem({
  label,
  icon,
  active,
  badge,
  indent,
  colorMarca,
  theme,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.item,
        indent && styles.itemNested,
        active && { backgroundColor: `${colorMarca}18` },
        (hovered || pressed) && !active && { backgroundColor: theme.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={icon}
        size={indent ? 16 : 18}
        color={active ? colorMarca : theme.textMuted}
        style={styles.itemIcon}
      />
      <Text
        style={[
          styles.itemLabel,
          { color: active ? colorMarca : theme.text },
          active && styles.itemLabelActive,
          indent && styles.itemLabelNested,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AdminDesktopSidebar({ tabState, onNavigateTab, onNavigateScreen }) {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const { tab, hub } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [viewerRol, setViewerRol] = useState('');
  const mpLinked = useMercadoPagoLinked();
  const active = activeRouteNames(tabState);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const sections = useMemo(
    () => buildSections(viewerRol, mpLinked),
    [viewerRol, mpLinked],
  );

  const logoUrl = clubData?.logoUrl?.trim();
  const clubInitial = clubData?.nombre?.charAt(0)?.toUpperCase() || '?';

  const resolveBadge = (item) => {
    if (!item?.badgeKey) return undefined;
    const count = item.badgeSource === 'hub' ? hub(item.badgeKey) : tab(item.badgeKey);
    return tabBadgeText(count);
  };

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: theme.surface,
          borderRightColor: theme.border,
        },
      ]}
    >
      <View style={[styles.brand, { borderBottomColor: theme.border }]}>
        <View style={[styles.logoWrap, { backgroundColor: `${colorMarca}22` }]}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
          ) : (
            <Text style={[styles.logoLetter, { color: colorMarca }]}>{clubInitial}</Text>
          )}
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandKicker, { color: theme.textMuted }]} numberOfLines={1}>
            Administración
          </Text>
          <Text style={[styles.brandTitle, { color: theme.text }]} numberOfLines={2}>
            {clubData?.nombre || 'Club'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => {
          const sectionActive = active.tab === section.tab;
          const tabBadge = section.tabBadge ? tabBadgeText(tab(section.tabBadge)) : undefined;
          return (
            <View key={section.tab} style={styles.section}>
              <SidebarItem
                label={section.label}
                icon={sectionActive ? section.iconFocused : section.icon}
                active={sectionActive && active.screen === TAB_ROOTS[section.tab]}
                badge={tabBadge}
                colorMarca={colorMarca}
                theme={theme}
                onPress={() => onNavigateTab?.(section.tab, TAB_ROOTS[section.tab])}
              />
              {section.items.map((item) => {
                const isRoot = item.screen === TAB_ROOTS[section.tab];
                if (isRoot) return null;
                const itemActive = sectionActive && active.screen === item.screen;
                return (
                  <SidebarItem
                    key={`${section.tab}-${item.screen}`}
                    label={item.label}
                    icon={item.icon}
                    active={itemActive}
                    badge={resolveBadge(item)}
                    indent
                    colorMarca={colorMarca}
                    theme={theme}
                    onPress={() => onNavigateScreen?.(section.tab, item.screen)}
                  />
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export { SIDEBAR_WIDTH };

const styles = StyleSheet.create({
  shell: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    height: '100%',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: 40, height: 40 },
  logoLetter: { fontSize: 22, fontWeight: '800' },
  brandText: { flex: 1, minWidth: 0 },
  brandKicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  brandTitle: { fontSize: 15, fontWeight: '700', lineHeight: 19 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 12, paddingHorizontal: 10, paddingBottom: 28 },
  section: { marginBottom: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
    cursor: 'pointer',
  },
  itemNested: {
    paddingVertical: 7,
    paddingLeft: 18,
    marginLeft: 8,
  },
  itemIcon: { marginRight: 10 },
  itemLabel: { flex: 1, fontSize: 14, fontWeight: '600', minWidth: 0 },
  itemLabelNested: { fontSize: 13, fontWeight: '500' },
  itemLabelActive: { fontWeight: '700' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
