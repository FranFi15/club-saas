import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NotificationBell from './NotificationBell';

/** Altura fija del bloque de marca (todas las pantallas). */
export const COACH_HEADER_HEIGHT = 152;

const TOOLBAR_HEIGHT = 40;
const TOOLBAR_TOP_PAD = 6;
const FOOTER_SLOT_HEIGHT = 28;
const BACK_BTN_SIZE = 36;
/** Espacio reservado a la derecha del texto cuando hay avatar en el hero. */
export const COACH_HEADER_HERO_RIGHT_SIZE = 100;

/**
 * Bloque de marca unificado: textos centro-izquierda, volver centro-derecha.
 */
export default function CoachScreenHeader({
  colorMarca,
  theme,
  kicker,
  title,
  subtitle,
  onBack,
  rightAccessory,
  heroRight,
  footer,
  reserveOverlaySpace = false,
  showNotifications = true,
}) {
  const toolbarLeft = onBack ? (
    <CoachHeaderActions>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.toolbarBtn}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>
    </CoachHeaderActions>
  ) : null;
  const toolbarRight = rightAccessory ? (
    <CoachHeaderActions>{rightAccessory}</CoachHeaderActions>
  ) : null;
  const showTopToolbar = onBack || !!rightAccessory;
  const heroRightInset = heroRight ? COACH_HEADER_HERO_RIGHT_SIZE + 12 : 0;

  return (
    <View style={[styles.heroWrap, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.hero,
          {
            backgroundColor: colorMarca,
            height: COACH_HEADER_HEIGHT,
          },
        ]}
      >
        {showTopToolbar ? (
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>{toolbarLeft}</View>
            <View style={styles.toolbarRight}>{toolbarRight}</View>
          </View>
        ) : null}

        <View
          style={[
            styles.heroBody,
            styles.heroBodyCentered,
            showNotifications && styles.heroBodyWithBack,
            heroRightInset > 0 && {
              paddingRight: Math.max(
                heroRightInset,
                showNotifications ? BACK_BTN_SIZE + 10 : 0,
              ),
            },
            reserveOverlaySpace && styles.heroBodyFabInset,
            showNotifications && reserveOverlaySpace && styles.heroBodyWithBackAndFabs,
          ]}
        >
          {kicker ? (
            <Text style={styles.heroKicker} numberOfLines={1}>
              {kicker}
            </Text>
          ) : null}
          <Text style={styles.heroTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.heroSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <View style={[styles.footerSlot, !footer && styles.footerSlotEmpty]}>
            {footer || null}
          </View>
        </View>

        {heroRight ? (
          <View style={styles.heroRightMid} pointerEvents="box-none">
            {heroRight}
          </View>
        ) : null}

        {showNotifications ? (
          <View
            style={[styles.actionMidRight, heroRightInset > 0 && { right: heroRightInset + 8 }]}
            pointerEvents="box-none"
          >
            <CoachHeaderActions>
              <NotificationBell />
            </CoachHeaderActions>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** FAB flotante sobre el header (agenda de sesiones, etc.). */
export function CoachHeaderOverlayFab({ colorMarca, onPress, icon = 'add', accessibilityLabel }) {
  return (
    <TouchableOpacity
      style={styles.fabOverlay}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={26} color={colorMarca} />
    </TouchableOpacity>
  );
}

/** Contenedor: header + FABs superpuestos en la esquina inferior derecha. */
export function CoachScreenHeaderWithFabs({ children, fabChildren }) {
  return (
    <View style={styles.headerFabHost}>
      {children}
      <View style={styles.headerFabOverlay} pointerEvents="box-none">
        {fabChildren}
      </View>
    </View>
  );
}

/** Botón compacto dentro de la barra del header (toolbar). */
export function CoachHeaderFab({ colorMarca, onPress, icon = 'add' }) {
  return (
    <TouchableOpacity
      style={styles.fabLight}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={22} color={colorMarca} />
    </TouchableOpacity>
  );
}

export function CoachHeaderActions({ children }) {
  return <View style={styles.headerActions}>{children}</View>;
}

export function CoachHeaderBadge({ children }) {
  return <View style={styles.heroBadge}>{children}</View>;
}

const styles = StyleSheet.create({
  heroWrap: { width: '100%', paddingTop: 8, paddingBottom: 4 },
  headerFabHost: {
    position: 'relative',
    zIndex: 2,
    marginBottom: 6,
  },
  headerFabOverlay: {
    position: 'absolute',
    right: 12,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 3,
  },
  hero: {
    borderRadius: 0,
    width: '100%',
    paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: TOOLBAR_TOP_PAD,
    minHeight: TOOLBAR_HEIGHT + TOOLBAR_TOP_PAD,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 1,
    maxWidth: '72%',
  },
  heroRightMid: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  actionMidRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  toolbarBtn: {
    width: BACK_BTN_SIZE,
    height: BACK_BTN_SIZE,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  heroBodyCentered: {
    paddingVertical: 4,
  },
  heroBodyWithBack: {
    paddingRight: BACK_BTN_SIZE + 10,
  },
  heroBodyWithBackAndFabs: {
    paddingRight: Math.max(BACK_BTN_SIZE + 10, 116),
  },
  heroBodyFabInset: {
    paddingRight: 116,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', lineHeight: 24 },
  heroSub: { color: '#e5e7eb', fontSize: 13, marginTop: 2, lineHeight: 18 },
  footerSlot: {
    height: FOOTER_SLOT_HEIGHT,
    marginTop: 4,
    justifyContent: 'center',
  },
  footerSlotEmpty: {
    height: 0,
    marginTop: 0,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxHeight: FOOTER_SLOT_HEIGHT,
  },
  fabLight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  fabOverlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
});
