import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';

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
}) {
  const autor = item?.autor || {};
  const name =
    authorName ||
    [autor.nombre, autor.apellido].filter(Boolean).join(' ').trim() ||
    'Club';
  const handle = rolHandle(autor.rol);
  const time = formatNewsRelative(item?.createdAt);
  const imageUrl = item?.imagen?.url;

  const body = (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
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
            <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" />
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
  mediaWrap: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  media: {
    width: '100%',
    height: 180,
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
