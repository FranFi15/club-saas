import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COACH_HEADER_HEIGHT, COACH_HEADER_HEIGHT_WITH_TOOLBAR, CoachHeaderActions } from './CoachScreenHeader';
import NotificationBell from './NotificationBell';
import HeaderClubLogo, { HEADER_CLUB_LOGO_SIZE } from './HeaderClubLogo';
import HeaderBottomFade, { HEADER_BOTTOM_FADE } from './HeaderBottomFade';
import { statusBarStyleForColor } from '../utils/statusBarContrast';
import { useAdminDesktopLayout } from '../hooks/useAdminDesktopLayout';

const BACK_BTN_SIZE = 36;
const DESKTOP_HEADER_HEIGHT = 72;
const DESKTOP_HEADER_HEIGHT_WITH_BOTTOM = 108;

/** Misma altura y estética que CoachScreenHeader (admin). En escritorio web: sin logo, volver junto al título. */
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
  /** 'right' (default) or 'center' — useful for month pickers on web. */
  bottomAccessoryAlign = 'right',
  /** Pantallas del sidebar: en desktop no mostramos volver. */
  sidebarRoot = false,
  showNotifications = true,
  showClubLogo = true,
}) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useAdminDesktopLayout();
  const topInset = Platform.OS === 'web' ? 0 : insets.top;
  const statusBarStyle = statusBarStyleForColor(colorMarca);
  const centerBottomAccessory = bottomAccessoryAlign === 'center' && !!bottomRightAccessory;
  const effectiveOnBack = sidebarRoot && isDesktop ? undefined : onBack;

  const backButton = effectiveOnBack ? (
    <TouchableOpacity
      onPress={effectiveOnBack}
      style={styles.toolbarBtn}
      accessibilityRole="button"
      accessibilityLabel={backAccessibilityLabel}
    >
      <Ionicons name="arrow-back" size={20} color="#ffffff" />
    </TouchableOpacity>
  ) : null;

  if (isDesktop) {
    const headerHeight = bottomRightAccessory
      ? DESKTOP_HEADER_HEIGHT_WITH_BOTTOM
      : DESKTOP_HEADER_HEIGHT;

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
        <View
          style={[
            styles.headerCard,
            styles.headerCardDesktop,
            { backgroundColor: colorMarca, height: headerHeight },
          ]}
        >
          <View
            style={[
              styles.desktopRow,
              bottomRightAccessory && styles.desktopRowWithBottom,
            ]}
          >
            {backButton ? <View style={styles.desktopBackWrap}>{backButton}</View> : null}
            {leadingAccessory ? <View style={styles.toolbarLeading}>{leadingAccessory}</View> : null}
            <View style={styles.headerTextCol}>
              {kicker ? (
                <Text style={[styles.headerKicker, styles.headerKickerDesktop]} numberOfLines={1}>
                  {kicker}
                </Text>
              ) : null}
              <Text style={[styles.headerTitle, styles.headerTitleDesktop]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.headerSub, styles.headerSubDesktop]} numberOfLines={subtitleLines}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {(rightAccessory || showNotifications) ? (
              <CoachHeaderActions>
                {rightAccessory}
                {showNotifications ? <NotificationBell /> : null}
              </CoachHeaderActions>
            ) : null}
          </View>

          {bottomRightAccessory ? (
            <View
              style={[
                styles.bottomRightAccessory,
                centerBottomAccessory && styles.bottomCenterAccessory,
              ]}
              pointerEvents="box-none"
            >
              {bottomRightAccessory}
            </View>
          ) : null}
        </View>
        <HeaderBottomFade color={colorMarca} background={theme?.background} />
      </View>
    );
  }

  // —— Mobile layout (logo + toolbar when back) ——
  const showTopToolbar = !!effectiveOnBack || !!leadingAccessory;
  const midRightAccessory = !effectiveOnBack ? rightAccessory : null;
  const showMidRight = !effectiveOnBack && (showNotifications || !!midRightAccessory);
  const midRightWide = showNotifications && !!midRightAccessory;
  const renderClubLogo = showClubLogo;
  const headerHeight = showTopToolbar ? COACH_HEADER_HEIGHT_WITH_TOOLBAR : COACH_HEADER_HEIGHT;
  const toolbarRightContent =
    effectiveOnBack && (rightAccessory || showNotifications) ? (
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
            height: headerHeight,
          },
        ]}
      >
        {showTopToolbar ? (
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              {backButton ? <CoachHeaderActions>{backButton}</CoachHeaderActions> : null}
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
            renderClubLogo && styles.headerBodyWithLogo,
            showMidRight && (midRightWide ? styles.headerBodyWithMidRightWide : styles.headerBodyWithMidRight),
            bottomRightAccessory && styles.headerBodyWithBottomRight,
            showTopToolbar && styles.headerBodyWithToolbar,
          ]}
        >
          {renderClubLogo ? <HeaderClubLogo size={HEADER_CLUB_LOGO_SIZE} /> : null}
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
          <View
            style={[
              styles.bottomRightAccessory,
              centerBottomAccessory && styles.bottomCenterAccessory,
            ]}
            pointerEvents="box-none"
          >
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
  headerCardDesktop: {
    paddingHorizontal: 20,
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  desktopRowWithBottom: {
    paddingBottom: 36,
  },
  desktopBackWrap: {
    flexShrink: 0,
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
  bottomCenterAccessory: {
    left: 0,
    right: 0,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 14,
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
  headerKickerDesktop: {
    fontSize: 10,
    marginBottom: 1,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', lineHeight: 21 },
  headerTitleDesktop: { fontSize: 18, lineHeight: 22 },
  headerSub: { color: '#e5e7eb', fontSize: 13, marginTop: 2, lineHeight: 18 },
  headerSubDesktop: { fontSize: 12, marginTop: 1, lineHeight: 16 },
});
