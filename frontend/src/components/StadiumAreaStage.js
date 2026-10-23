import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';

const MIN = 8;
const MAX = 80;

const HANDLES = [
  ['nw', { left: 0, top: 0 }, 'nwse-resize'],
  ['ne', { right: 0, top: 0 }, 'nesw-resize'],
  ['sw', { left: 0, bottom: 0 }, 'nesw-resize'],
  ['se', { right: 0, bottom: 0 }, 'nwse-resize'],
];

function round1(value) {
  return Math.round(value * 10) / 10;
}

function applyDrag(mode, start, dx, dy) {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;
  const west = mode.includes('w');
  const north = mode.includes('n');
  const east = mode.includes('e');
  const south = mode.includes('s');

  if (mode === 'move') {
    x += dx;
    y += dy;
  } else {
    if (east) w += dx;
    if (south) h += dy;
    if (west) {
      x += dx;
      w -= dx;
    }
    if (north) {
      y += dy;
      h -= dy;
    }
  }

  if (w < MIN) {
    if (west) x -= MIN - w;
    w = MIN;
  } else if (w > MAX) {
    if (west) x += w - MAX;
    w = MAX;
  }
  if (h < MIN) {
    if (north) y -= MIN - h;
    h = MIN;
  } else if (h > MAX) {
    if (north) y += h - MAX;
    h = MAX;
  }
  if (x < 0) {
    if (east && !west) w += x;
    x = 0;
  }
  if (y < 0) {
    if (south && !north) h += y;
    y = 0;
  }
  if (x + w > 100) {
    if (west && !east) x = 100 - w;
    else w = 100 - x;
  }
  if (y + h > 100) {
    if (north && !south) y = 100 - h;
    else h = 100 - y;
  }

  w = Math.max(MIN, Math.min(MAX, w));
  h = Math.max(MIN, Math.min(MAX, h));
  x = Math.max(0, Math.min(100 - w, x));
  y = Math.max(0, Math.min(100 - h, y));
  return { x: round1(x), y: round1(y), w: round1(w), h: round1(h) };
}

export default function StadiumAreaStage({ uri, sections, activeIndex, color, onChange, onPressPoint, style }) {
  const sizeRef = useRef({ w: 1, h: 1 });
  const sectionsRef = useRef(sections);
  const onChangeRef = useRef(onChange);
  const stopDrag = useRef(null);
  sectionsRef.current = sections;
  onChangeRef.current = onChange;

  useEffect(() => () => stopDrag.current?.(), []);

  const startDrag = (mode, event) => {
    if (Platform.OS !== 'web' || activeIndex == null) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const section = sectionsRef.current?.[activeIndex];
    if (!section) return;
    stopDrag.current?.();
    const origin = {
      x: Number(section.x) || 0,
      y: Number(section.y) || 0,
      w: Number(section.w) || 24,
      h: Number(section.h) || 16,
    };
    const startX = event.nativeEvent.clientX;
    const startY = event.nativeEvent.clientY;
    const index = activeIndex;
    const move = (nativeEvent) => {
      nativeEvent.preventDefault?.();
      const { w, h } = sizeRef.current;
      if (!w || !h) return;
      const dx = ((nativeEvent.clientX - startX) / w) * 100;
      const dy = ((nativeEvent.clientY - startY) / h) * 100;
      onChangeRef.current(index, applyDrag(mode, origin, dx, dy));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      stopDrag.current = null;
    };
    stopDrag.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  const setCursor = (cursor) => (node) => {
    if (node?.style) node.style.cursor = cursor;
  };

  const Root = Platform.OS === 'web' ? View : Pressable;

  return (
    <Root
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width && height) sizeRef.current = { w: width, h: height };
      }}
      onPress={
        Platform.OS === 'web'
          ? undefined
          : (event) => {
              if (activeIndex == null || !onPressPoint) return;
              const { w, h } = sizeRef.current;
              if (!w || !h) return;
              onPressPoint(
                (event.nativeEvent.locationX / w) * 100,
                (event.nativeEvent.locationY / h) * 100,
              );
            }
      }
      style={[
        styles.stage,
        style,
        Platform.OS === 'web' && activeIndex != null ? { touchAction: 'none' } : null,
      ]}
      ref={(node) => {
        if (node?.style) node.style.touchAction = 'none';
      }}
    >
      <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      {(sections || []).map((section, idx) => {
        const hasArea = Number(section.w) > 0 && Number(section.h) > 0;
        const active = idx === activeIndex;
        const boxStyle = hasArea
          ? {
              left: `${Number(section.x) || 0}%`,
              top: `${Number(section.y) || 0}%`,
              width: `${Number(section.w)}%`,
              height: `${Number(section.h)}%`,
            }
          : {
              left: `${Number(section.x) || 0}%`,
              top: `${Number(section.y) || 0}%`,
            };
        const label = (
          <Text style={{ color, fontWeight: '800', fontSize: 11 }} numberOfLines={1}>
            {section.nombre || `Sector ${idx + 1}`}
          </Text>
        );

        if (Platform.OS === 'web' && active && hasArea) {
          return (
            <View
              key={`area-${idx}`}
              ref={setCursor('move')}
              onPointerDown={(event) => startDrag('move', event)}
              style={[
                styles.area,
                boxStyle,
                {
                  borderColor: color,
                  backgroundColor: `${color}55`,
                  zIndex: 2,
                },
              ]}
            >
              {label}
              {HANDLES.map(([mode, position, cursor]) => (
                <View
                  key={mode}
                  ref={setCursor(cursor)}
                  onPointerDown={(event) => startDrag(mode, event)}
                  style={[styles.handle, position, { borderColor: color }]}
                />
              ))}
            </View>
          );
        }

        return (
          <View
            key={`area-${idx}`}
            pointerEvents="none"
            style={
              hasArea
                ? [
                    styles.area,
                    boxStyle,
                    {
                      borderColor: color,
                      backgroundColor: active ? `${color}55` : `${color}22`,
                    },
                  ]
                : [styles.pin, boxStyle, { backgroundColor: '#fff', borderColor: color }]
            }
          >
            {label}
          </View>
        );
      })}
    </Root>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  area: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  pin: {
    position: 'absolute',
    transform: [{ translateX: -28 }, { translateY: -12 }],
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 110,
  },
  handle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: '#fff',
    zIndex: 3,
  },
});
