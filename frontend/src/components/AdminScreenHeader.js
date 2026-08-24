import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COACH_HEADER_HEIGHT, CoachHeaderActions } from './CoachScreenHeader';
import NotificationBell from './NotificationBell';
import HeaderClubLogo, { HEADER_CLUB_LOGO_SIZE } from './HeaderClubLogo';

const BACK_BTN_SIZE = 36;

/** Misma altura y estética que CoachScreenHeader (admin). */
export default function AdminScreenHeader({
  theme,
  colorMarca,
  kicker,
  title,
  subtitle,
  onBack,
  backAccessibilityLabel = 'Volver',
  rightAccessory,
  bottomRightAccessory,
  showNotifications = true,
  showClubLogo = true,
}) {
  // Toolbar solo con volver: en hubs (sin back) logo/título quedan centrados más arriba.
  const showTopToolbar = !!onBack;
  const midRightAccessory = !onBack ? rightAccessory : null;
  const toolbarRightAccessory = onBack ? rightAccessory : null;
  const showMidRight = showNotifications || !!midRightAccessory;
  const midRightWide = showNotifications && !!midRightAccessory;

  return (
    <View style={[styles.headerWrap, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: colorMarca,
            height: COACH_HEADER_HEIGHT,
          },
        ]}
      >
        {showTopToolbar ? (
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              <CoachHeaderActions>
                <TouchableOpacity
                  onPress={onBack}
                  style={styles.toolbarBtn}
                  accessibilityRole="button"
                  accessibilityLabel={backAccessibilityLabel}
                >
                  <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
              </CoachHeaderActions>
            </View>
            <View style={styles.toolbarRight}>
              {toolbarRightAccessory ? (
                <CoachHeaderActions>{toolbarRightAccessory}</CoachHeaderActions>
              ) : null}
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.headerBody,
            styles.headerBodyCentered,
            showClubLogo && styles.headerBodyWithLogo,
            showMidRight && (midRightWide ? styles.headerBodyWithMidRightWide : styles.headerBodyWithMidRight),
            bottomRightAccessory && styles.headerBodyWithBottomRight,
          ]}
        >
          {showClubLogo ? <HeaderClubLogo size={HEADER_CLUB_LOGO_SIZE} /> : null}
          <View style={styles.headerTextCol}>
            <Text style={styles.headerKicker} numberOfLines={1}>
              {kicker}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {bottomRightAccessory ? (
          <View style={styles.bottomRightAccessory} pointerEvents="box-none">
            {bottomRightAccessory}
          </View>
        ) : null}

        {showMidRight ? (
          <View
            style={[styles.actionMidRight, bottomRightAccessory && styles.actionTopRight]}
            pointerEvents="box-none"
          >
            <CoachHeaderActions>
              {midRightAccessory}
              {showNotifications ? <NotificationBell /> : null}
            </CoachHeaderActions>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { width: '100%', paddingTop: 8, paddingBottom: 4 },
  headerCard: {
    borderRadius: 0,
    width: '100%',
    paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 6,
    minHeight: 46,
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
  bottomRightAccessory: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    zIndex: 3,
    maxWidth: '58%',
  },
  actionMidRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  actionTopRight: {
    top: 10,
    bottom: undefined,
    justifyContent: 'flex-start',
  },
  toolbarBtn: {
    width: BACK_BTN_SIZE,
    height: BACK_BTN_SIZE,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerBodyWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerBodyCentered: {
    paddingVertical: 4,
  },
  headerBodyWithMidRight: {
    paddingRight: BACK_BTN_SIZE + 10,
  },
  headerBodyWithMidRightWide: {
    paddingRight: BACK_BTN_SIZE * 2 + 16,
  },
  headerBodyWithBottomRight: {
    paddingBottom: 4,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', lineHeight: 21 },
  headerSub: { color: '#e5e7eb', fontSize: 13, marginTop: 2, lineHeight: 18 },
});
