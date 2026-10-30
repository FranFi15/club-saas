import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COACH_HEADER_HEIGHT, COACH_HEADER_HEIGHT_WITH_TOOLBAR, CoachHeaderActions } from './CoachScreenHeader';
import NotificationBell from './NotificationBell';
import HeaderClubLogo, { HEADER_CLUB_LOGO_SIZE } from './HeaderClubLogo';
import HeaderBottomFade, { HEADER_BOTTOM_FADE } from './HeaderBottomFade';
import { statusBarStyleForColor } from '../utils/statusBarContrast';

const BACK_BTN_SIZE = 36;

/** Misma altura y estética que CoachScreenHeader (admin). */
export default function AdminScreenHeader({
  theme,
  colorMarca,
  kicker,
  title,
  subtitle,
  subtitleLines = 1,
  onBack,
  backAccessibilityLabel = 'Volver',
  rightAccessory,
  leadingAccessory,
  bottomRightAccessory,
  showNotifications = true,
  showClubLogo = true,
}) {
  // Con volver: acciones + campana van juntos arriba a la derecha (evita solaparse con el título).
  const showTopToolbar = !!onBack || !!leadingAccessory;
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 0 : insets.top;
  const statusBarStyle = statusBarStyleForColor(colorMarca);
  const midRightAccessory = !onBack ? rightAccessory : null;
  const showMidRight = !onBack && (showNotifications || !!midRightAccessory);
  const midRightWide = showNotifications && !!midRightAccessory;
  const toolbarRightContent =
    onBack && (rightAccessory || showNotifications) ? (
      <>
        {rightAccessory}
        {showNotifications ? <NotificationBell /> : null}
      </>
    ) : null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.headerWrap,
        {
          backgroundColor: colorMarca,
          marginTop: -topInset,
          paddingTop: topInset,
        },
      ]}
    >
      {Platform.OS === 'web' ? null : (
        <StatusBar barStyle={statusBarStyle} translucent backgroundColor="transparent" />
      )}
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: colorMarca,
            height: showTopToolbar ? COACH_HEADER_HEIGHT_WITH_TOOLBAR : COACH_HEADER_HEIGHT,
          },
        ]}
      >
        {showTopToolbar ? (
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              {onBack ? (
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
              ) : null}
              {leadingAccessory ? <View style={styles.toolbarLeading}>{leadingAccessory}</View> : null}
            </View>
            <View style={styles.toolbarRight}>
              {toolbarRightContent ? (
                <CoachHeaderActions>{toolbarRightContent}</CoachHeaderActions>
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
            showTopToolbar && styles.headerBodyWithToolbar,
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
              <Text style={styles.headerSub} numberOfLines={subtitleLines}>
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
      <HeaderBottomFade color={colorMarca} background={theme?.background} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { width: '100%', zIndex: 2, marginBottom: HEADER_BOTTOM_FADE },
  headerCard: {
    borderRadius: 0,
    width: '100%',
    paddingHorizontal: 16,
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
    flexShrink: 1,
    minWidth: 0,
    gap: 8,
  },
  toolbarLeading: {
    flexShrink: 1,
    minWidth: 0,
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
    bottom: 22,
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
  headerBodyWithToolbar: {
    paddingTop: 0,
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
