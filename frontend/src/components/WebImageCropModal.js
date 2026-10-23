import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';

const FRAME_W = 320;
const FRAME_H = 180; // 16:9 default; overridden by aspect

/**
 * Web-only crop UI: pan + zoom inside a fixed aspect frame, export JPEG blob.
 * No-op shell on native (caller should use ImagePicker allowsEditing instead).
 */
export default function WebImageCropModal({
  visible,
  imageUri,
  aspect = [16, 9],
  colorMarca = '#3b82f6',
  onCancel,
  onConfirm,
  embedded = false,
}) {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef(null);

  const frame = useMemo(() => {
    const [aw, ah] = aspect;
    const ratio = aw / ah;
    const w = FRAME_W;
    const h = Math.round(w / ratio);
    return { w, h, ratio };
  }, [aspect]);

  const coverScale = useMemo(() => {
    if (!imgSize.w || !imgSize.h) return 1;
    return Math.max(frame.w / imgSize.w, frame.h / imgSize.h);
  }, [imgSize, frame]);

  const minScale = coverScale;
  const maxScale = coverScale * 4;

  useEffect(() => {
    if (!visible || !imageUri) return;
    setImgSize({ w: 0, h: 0 });
    setOffset({ x: 0, y: 0 });
    Image.getSize(
      imageUri,
      (w, h) => {
        setImgSize({ w, h });
        const cover = Math.max(frame.w / w, frame.h / h);
        setScale(cover);
        setOffset({ x: 0, y: 0 });
      },
      () => setImgSize({ w: 0, h: 0 })
    );
  }, [visible, imageUri, frame.w, frame.h]);

  const clampOffset = useCallback(
    (x, y, s) => {
      const dispW = imgSize.w * s;
      const dispH = imgSize.h * s;
      const maxX = Math.max(0, (dispW - frame.w) / 2);
      const maxY = Math.max(0, (dispH - frame.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [imgSize, frame]
  );

  const onScaleChange = (next) => {
    const s = Math.min(maxScale, Math.max(minScale, next));
    setScale(s);
    setOffset((o) => clampOffset(o.x, o.y, s));
  };

  const onPointerDown = (e) => {
    if (Platform.OS !== 'web') return;
    const pe = e.nativeEvent;
    dragRef.current = {
      startX: pe.pageX ?? pe.clientX,
      startY: pe.pageY ?? pe.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const pe = e.nativeEvent;
    const pageX = pe.pageX ?? pe.clientX;
    const pageY = pe.pageY ?? pe.clientY;
    const dx = pageX - dragRef.current.startX;
    const dy = pageY - dragRef.current.startY;
    setOffset(
      clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, scale)
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const exportCrop = async () => {
    if (Platform.OS !== 'web' || !imgSize.w || !imageUri) return;
    setExporting(true);
    try {
      const img = await loadHtmlImage(imageUri);
      const dispW = imgSize.w * scale;
      const dispH = imgSize.h * scale;
      // Top-left of image relative to frame origin
      const imgLeft = (frame.w - dispW) / 2 + offset.x;
      const imgTop = (frame.h - dispH) / 2 + offset.y;
      // Frame in image pixel space
      const sx = (-imgLeft) / scale;
      const sy = (-imgTop) / scale;
      const sw = frame.w / scale;
      const sh = frame.h / scale;

      const outW = 1280;
      const outH = Math.round(outW / frame.ratio);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('No se pudo recortar la imagen.'))),
          'image/jpeg',
          0.85
        );
      });
      const BrowserFile = globalThis.File;
      const file = BrowserFile
        ? new BrowserFile([blob], `evento-${Date.now()}.jpg`, { type: 'image/jpeg' })
        : blob;
      await onConfirm?.(file);
    } finally {
      setExporting(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  const ready = imgSize.w > 0;
  if (embedded && !visible) return null;

  const sheet = (
      <View style={embedded ? [StyleSheet.absoluteFill, styles.backdrop, styles.embedded] : styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Ajustar imagen</Text>
          <Text style={styles.hint}>Arrastrá para encuadrar · usá el zoom</Text>

          <View
            style={[styles.frame, { width: frame.w, height: frame.h }]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onPointerDown}
            onResponderMove={onPointerMove}
            onResponderRelease={onPointerUp}
            onResponderTerminate={onPointerUp}
          >
            {ready ? (
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: 'absolute',
                  width: imgSize.w * scale,
                  height: imgSize.h * scale,
                  left: (frame.w - imgSize.w * scale) / 2 + offset.x,
                  top: (frame.h - imgSize.h * scale) / 2 + offset.y,
                }}
                resizeMode="stretch"
              />
            ) : (
              <ActivityIndicator color={colorMarca} />
            )}
          </View>

          <View style={styles.zoomRow}>
            <Ionicons name="remove" size={18} color="#64748b" />
            <Slider
              style={styles.slider}
              minimumValue={minScale}
              maximumValue={maxScale}
              value={scale}
              onValueChange={onScaleChange}
              minimumTrackTintColor={colorMarca}
              maximumTrackTintColor="#cbd5e1"
              thumbTintColor={colorMarca}
              disabled={!ready}
            />
            <Ionicons name="add" size={18} color="#64748b" />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel} disabled={exporting}>
              <Text style={styles.btnGhostTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: colorMarca }]}
              onPress={exportCrop}
              disabled={!ready || exporting}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryTxt}>Usar imagen</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
  );

  if (embedded) return sheet;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {sheet}
    </Modal>
  );
}

function loadHtmlImage(uri) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (/^https?:/i.test(String(uri || ''))) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = uri;
  });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  embedded: { zIndex: 60, elevation: 60 },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  hint: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  frame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  slider: { flex: 1, height: 36, marginHorizontal: 8 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 14, marginRight: 8 },
  btnGhostTxt: { color: '#64748b', fontWeight: '700' },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700' },
});
