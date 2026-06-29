import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COACH_HEADER_HEIGHT, CoachHeaderActions } from './CoachScreenHeader';
import NotificationBell from './NotificationBell';

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
}) {
  const toolbarLeft = showNotifications ? (
    <CoachHeaderActions>
      <NotificationBell />
    </CoachHeaderActions>
  ) : null;
  const toolbarRight = rightAccessory ? (
    <CoachHeaderActions>{rightAccessory}</CoachHeaderActions>
  ) : null;
  const showTopToolbar = showNotifications || !!rightAccessory;

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
            <View style={styles.toolbarLeft}>{toolbarLeft}</View>
            <View style={styles.toolbarRight}>{toolbarRight}</View>
          </View>
        ) : null}

        <View
          style={[
            styles.headerBody,
            styles.headerBodyCentered,
            onBack && styles.headerBodyWithBack,
            bottomRightAccessory && styles.headerBodyWithBottomRight,
          ]}
        >
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

        {bottomRightAccessory ? (
          <View style={styles.bottomRightAccessory} pointerEvents="box-none">
            {bottomRightAccessory}
          </View>
        ) : null}

        {onBack ? (
          <View
            style={[styles.backMidRight, bottomRightAccessory && styles.backTopRight]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={onBack}
              style={styles.toolbarBtn}
              accessibilityRole="button"
              accessibilityLabel={backAccessibilityLabel}
            >
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerCard: {
    borderRadius: 5,
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
  backMidRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  backTopRight: {
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
  headerBodyCentered: {
    paddingVertical: 4,
  },
  headerBodyWithBack: {
    paddingRight: BACK_BTN_SIZE + 10,
  },
  headerBodyWithBottomRight: {
    paddingBottom: 4,
    paddingRight: 8,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', lineHeight: 24 },
  headerSub: { color: '#e5e7eb', fontSize: 13, marginTop: 2, lineHeight: 18 },
});
