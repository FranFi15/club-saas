import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import CourtPresetImage from './CourtPresetImage';
import { MatchMark } from './MatchMark';
import { isCourtPresetUrl } from '../constants/courtMetrics';

export default function MatchCourtBoard({
  imagenUrl,
  deporte,
  height = 280,
  width,
  horizontal = false,
  onTap,
  flash,
  marks = [],
  theme,
  logoUrl,
}) {
  const [layout, setLayout] = useState({ w: 1, h: 1 });
  const [measuredW, setMeasuredW] = useState(0);
  const unbind = useRef(null);
  const sized = typeof width === 'number';
  const boardW = sized ? width : measuredW || undefined;
  const boardH = horizontal && boardW ? boardW / (200 / 120) : height;
  const logoSize = Math.min(layout.w, layout.h) * 0.2;

  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const emit = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    onTapRef.current?.({
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    });
  };

  const bindBoard = useCallback((node) => {
    if (unbind.current) {
      unbind.current();
      unbind.current = null;
    }
    if (Platform.OS !== 'web' || !node || typeof node.addEventListener !== 'function') return;
    const onClick = (ev) => {
      const rect = node.getBoundingClientRect?.();
      if (!rect?.width || !rect?.height) return;
      emit((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
    };
    node.addEventListener('click', onClick);
    unbind.current = () => node.removeEventListener('click', onClick);
  }, []);

  return (
    <View
      style={{ width: sized ? boardW : '100%', alignSelf: 'center' }}
      onLayout={(e) => {
        if (sized) return;
        const next = e.nativeEvent.layout.width;
        if (next && Math.abs(next - measuredW) > 1) setMeasuredW(next);
      }}
    >
    <Pressable
      ref={bindBoard}
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout;
        setLayout({ w: width || 1, h: h || 1 });
      }}
      onPress={(ev) => {
        if (Platform.OS === 'web') return;
        emit(ev.nativeEvent.locationX / layout.w, ev.nativeEvent.locationY / layout.h);
      }}
      style={{
        width: boardW || '100%',
        height: boardH,
        alignSelf: 'center',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: theme?.surface || '#111',
        borderWidth: 1,
        borderColor: theme?.border || '#333',
      }}
    >
      {isCourtPresetUrl(imagenUrl) || !imagenUrl ? (
        <CourtPresetImage imagenUrl={imagenUrl} deporte={deporte} height={boardH} width="100%" horizontal={horizontal} />
      ) : (
        <Image source={{ uri: imagenUrl }} style={{ width: '100%', height: boardH }} resizeMode="contain" />
      )}
      {logoUrl ? (
        <Image
          pointerEvents="none"
          source={{ uri: logoUrl }}
          resizeMode="cover"
          style={{
            position: 'absolute',
            width: logoSize,
            height: logoSize,
            borderRadius: logoSize / 2,
            left: (layout.w - logoSize) / 2,
            top: (layout.h - logoSize) / 2,
            opacity: 0.9,
          }}
        />
      ) : null}
      {flash ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: flash.x * layout.w - 12,
            top: flash.y * layout.h - 12,
          }}
        >
          <MatchMark tipo={flash.icono} size={24} color={flash.color || '#fff'} />
        </View>
      ) : null}
      {marks.map((mark, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={{ position: 'absolute', left: mark.x * layout.w - 9, top: mark.y * layout.h - 9 }}
        >
          <MatchMark tipo={mark.icono || 'circulo'} size={18} color={mark.color || '#fff'} />
        </View>
      ))}
    </Pressable>
    </View>
  );
}
