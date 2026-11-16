import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';

const DEFAULT_ASPECT = 16 / 9;
/** Keep extreme portrait/landscape from blowing up a feed row. */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 2.4;
/** Desktop/web: keep feed + compose previews from filling the viewport. */
const WEB_MAX_WIDTH = 480;
const WEB_MAX_HEIGHT = 360;

/**
 * Image sized to the photo’s real aspect ratio (no forced crop box).
 * On web, fits inside max width/height without letterbox bars — the shell
 * shrinks to the image (e.g. 9:16) instead of filling a wide gray/white box.
 */
export function NewsAspectImage({
  uri,
  style,
  resizeMode = 'cover',
  maxWidth,
  maxHeight,
}) {
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);
  const isWeb = Platform.OS === 'web';
  const capW = maxWidth ?? (isWeb ? WEB_MAX_WIDTH : undefined);
  const capH = maxHeight ?? (isWeb ? WEB_MAX_HEIGHT : undefined);

  useEffect(() => {
    let cancelled = false;
    if (!uri) return undefined;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !(w > 0) || !(h > 0)) return;
        const next = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, w / h));
        setAspectRatio(next);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!uri) return null;

  let boxStyle;
  if (capW != null || capH != null) {
    const maxW = capW ?? WEB_MAX_WIDTH;
    const maxH = capH ?? WEB_MAX_HEIGHT;
    let w = maxW;
    let h = w / aspectRatio;
    if (h > maxH) {
      h = maxH;
      w = h * aspectRatio;
    }
    boxStyle = { width: w, height: h, maxWidth: '100%' };
  } else {
    boxStyle = { width: '100%', aspectRatio, height: undefined };
  }

  return (
    <View style={[styles.aspectShell, boxStyle]}>
      <Image
        source={{ uri }}
        style={[{ width: '100%', height: '100%' }, style]}
        resizeMode={resizeMode}
      />
    </View>
  );
}

/** Relative time for feed rows (es-AR friendly short form). */
export function formatNewsRelative(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) {
      return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    }
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function rolHandle(rol) {
  if (!rol) return '';
  return String(rol).replace(/_/g, '');
}

/**
 * X-style timeline post row for noticias feeds.
 */
export default function NewsFeedPost({
  item,
  theme,
  colorMarca = '#3b82f6',
  onPress,
  onPressImage,
  authorName,
  metaRight,
  maxTitleLines = 2,
  maxContentLines = 4,
  style,
}) {
  const autor = item?.autor || {};
  const name =
    authorName ||
    [autor.apellido, autor.nombre].filter(Boolean).join(' ').trim() ||
    'Club';
  const handle = rolHandle(autor.rol);
  const time = formatNewsRelative(item?.createdAt);
  const imageUrl = item?.imagen?.url;

  const body = (
    <View style={[styles.row, { borderBottomColor: theme.border }, style]}>
      <UserAvatar user={autor} size={40} colorMarca={colorMarca} style={styles.avatar} />
      <View style={styles.main}>
        <View style={styles.headerLine}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {name}
          </Text>
          {handle ? (
            <Text style={[styles.handle, { color: theme.textMuted }]} numberOfLines={1}>
              @{handle}
            </Text>
          ) : null}
          {time ? (
            <>
              <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
              <Text style={[styles.time, { color: theme.textMuted }]}>{time}</Text>
            </>
          ) : null}
          {metaRight ? <View style={styles.metaRight}>{metaRight}</View> : null}
        </View>

        {item?.titulo ? (
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={maxTitleLines}>
            {item.titulo}
          </Text>
        ) : null}

        {item?.contenido ? (
          <Text style={[styles.content, { color: theme.text }]} numberOfLines={maxContentLines}>
            {item.contenido}
          </Text>
        ) : null}

        {imageUrl ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onPressImage?.(imageUrl, item.titulo)}
            style={styles.mediaWrap}
          >
            <NewsAspectImage uri={imageUrl} style={styles.media} />
            <View style={styles.mediaBadge}>
              <Ionicons name="expand-outline" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { marginRight: 12 },
  main: { flex: 1, minWidth: 0 },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginBottom: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 4,
    maxWidth: '42%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  handle: {
    fontSize: 14,
    flexShrink: 1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  dot: { fontSize: 14, marginHorizontal: 4 },
  time: {
    fontSize: 14,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  metaRight: {
    marginLeft: 'auto',
    paddingLeft: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 2,
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  aspectShell: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  mediaWrap: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  media: {
    width: '100%',
  },
  mediaBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 6,
  },
});
