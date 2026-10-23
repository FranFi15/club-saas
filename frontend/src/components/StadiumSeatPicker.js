import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, PanResponder, StyleSheet } from 'react-native';

const SEAT = 36;
const GAP = 4;
const LABEL = 34;

function sameSeat(a, b) {
  return (
    String(a?.seccionId) === String(b?.seccionId) &&
    Number(a?.fila) === Number(b?.fila) &&
    Number(a?.numero) === Number(b?.numero)
  );
}

function SeatZoom({ rows, cols, renderSeat, onToggle, color, theme }) {
  const naturalW = LABEL + GAP + cols * SEAT + Math.max(0, cols - 1) * GAP;
  const naturalH = rows * (SEAT + GAP);
  const [boxW, setBoxW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const fitRef = useRef(1);
  const boxRef = useRef(0);
  const naturalRef = useRef({ w: naturalW, h: naturalH });
  const grantPan = useRef({ x: 0, y: 0 });
  const pinchRef = useRef(null);
  const applyZoomRef = useRef(() => {});
  naturalRef.current = { w: naturalW, h: naturalH };
  const fit = boxW > 0 ? Math.min(1, boxW / naturalW) : 1;
  fitRef.current = fit;
  boxRef.current = boxW;
  const scale = fit * zoom;
  const viewH = Math.max(72, naturalH * fit);
  const showNumber = SEAT * scale >= 16;

  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [rows, cols]);

  const clampPan = (next, z) => {
    const s = fitRef.current * z;
    const minX = Math.min(0, boxRef.current - naturalRef.current.w * s);
    const minY = Math.min(0, naturalRef.current.h * fitRef.current - naturalRef.current.h * s);
    return {
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y)),
    };
  };

  applyZoomRef.current = (nextZoom, focusX, focusY) => {
    const prevScale = fitRef.current * zoomRef.current || 1;
    const maxZoom = Math.min(8, Math.max(2.5, 42 / SEAT / Math.max(fitRef.current, 0.05)));
    const z = Math.max(1, Math.min(maxZoom, nextZoom));
    const nextScale = fitRef.current * z;
    const nextPan = clampPan(
      {
        x: focusX - ((focusX - panRef.current.x) / prevScale) * nextScale,
        y: focusY - ((focusY - panRef.current.y) / prevScale) * nextScale,
      },
      z,
    );
    zoomRef.current = z;
    panRef.current = nextPan;
    setZoom(z);
    setPan(nextPan);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => (event.nativeEvent.touches || []).length >= 2,
      onMoveShouldSetPanResponderCapture: (event, gesture) => {
        if ((event.nativeEvent.touches || []).length >= 2) return true;
        return zoomRef.current > 1.02 && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8);
      },
      onPanResponderTerminationRequest: () => !pinchRef.current && zoomRef.current <= 1.02,
      onPanResponderGrant: (event) => {
        grantPan.current = { ...panRef.current };
        const touches = event.nativeEvent.touches || [];
        if (touches.length >= 2) {
          pinchRef.current = {
            dist: Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY),
            zoom: zoomRef.current,
          };
        }
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches || [];
        if (touches.length >= 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (!pinchRef.current) pinchRef.current = { dist, zoom: zoomRef.current };
          const viewHNow = naturalRef.current.h * fitRef.current;
          applyZoomRef.current(
            pinchRef.current.zoom * (dist / (pinchRef.current.dist || dist)),
            (boxRef.current || 1) / 2,
            viewHNow / 2,
          );
          return;
        }
        if (zoomRef.current > 1.02) {
          const next = clampPan(
            { x: grantPan.current.x + gesture.dx, y: grantPan.current.y + gesture.dy },
            zoomRef.current,
          );
          panRef.current = next;
          setPan(next);
        }
      },
      onPanResponderRelease: () => {
        pinchRef.current = null;
      },
      onPanResponderTerminate: () => {
        pinchRef.current = null;
      },
    }),
  ).current;

  const translateX = pan.x - (naturalW * (1 - scale)) / 2;
  const translateY = pan.y - (naturalH * (1 - scale)) / 2;

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width && width !== boxRef.current) setBoxW(width);
      }}
      style={[styles.zoomView, { height: boxW ? viewH : 120 }]}
      {...responder.panHandlers}
    >
      <View
        style={{
          width: naturalW,
          height: naturalH,
          transform: [{ translateX }, { translateY }, { scale }],
        }}
      >
        {Array.from({ length: rows }, (_, row) => (
          <View key={`row-${row + 1}`} style={styles.seats}>
            <View style={styles.rowLabel}>
              <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '700' }}>Fila</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{row + 1}</Text>
            </View>
            {Array.from({ length: cols }, (_, col) => {
              const fila = row + 1;
              const numero = col + 1;
              const seat = renderSeat(fila, numero);
              return (
                <Pressable
                  key={seat.key}
                  disabled={seat.isTaken}
                  onPress={() => onToggle(fila, numero)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: seat.isTaken, selected: seat.isOn }}
                  accessibilityLabel={`Fila ${fila}, asiento ${numero}${seat.isTaken ? ', ocupado' : ''}`}
                  style={[
                    styles.seat,
                    {
                      backgroundColor: seat.isTaken ? theme.border : seat.isOn ? color : theme.surface,
                      borderColor: seat.isOn ? color : theme.border,
                    },
                  ]}
                >
                  {showNumber ? (
                    <Text style={{ color: seat.isOn ? '#fff' : seat.isTaken ? theme.textMuted : theme.text, fontSize: 12, fontWeight: '800' }}>
                      {numero}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function StadiumSeatPicker({
  imageUrl,
  sections,
  occupied,
  selected,
  onChange,
  max = 20,
  color,
  theme,
}) {
  const [openId, setOpenId] = useState(sections?.[0] ? String(sections[0]._id) : '');
  const open = (sections || []).find((section) => String(section._id) === String(openId)) || sections?.[0];
  const taken = new Set(
    (occupied || []).map((seat) => `${seat.seccionId}:${seat.fila}:${seat.numero}`),
  );
  const chosen = selected || [];

  const toggle = (section, fila, numero) => {
    const seat = {
      seccionId: String(section._id),
      seccionNombre: section.nombre,
      fila,
      numero,
      tipoEntrada: String(section.tipoEntrada),
    };
    const exists = chosen.some((item) => sameSeat(item, seat));
    if (exists) {
      onChange(chosen.filter((item) => !sameSeat(item, seat)));
      return;
    }
    if (chosen.length >= max) return;
    const currentTipo = chosen[0]?.tipoEntrada;
    const next = currentTipo && currentTipo !== seat.tipoEntrada ? [seat] : [...chosen, seat];
    onChange(next);
  };

  return (
    <View>
      {imageUrl ? (
        <View style={styles.mapWrap}>
          <Image source={{ uri: imageUrl }} style={styles.map} resizeMode="contain" />
          {(sections || []).map((section) => {
            const on = open && String(open._id) === String(section._id);
            const hasArea = Number(section.w) > 0 && Number(section.h) > 0;
            return (
              <Pressable
                key={String(section._id)}
                onPress={() => setOpenId(String(section._id))}
                accessibilityRole="button"
                accessibilityLabel={section.nombre}
                style={[
                  hasArea ? styles.area : styles.pin,
                  hasArea
                    ? {
                        left: `${Number(section.x) || 0}%`,
                        top: `${Number(section.y) || 0}%`,
                        width: `${Number(section.w)}%`,
                        height: `${Number(section.h)}%`,
                        backgroundColor: on ? `${color}88` : `${color}33`,
                        borderColor: color,
                      }
                    : {
                        left: `${Number(section.x) || 0}%`,
                        top: `${Number(section.y) || 0}%`,
                        backgroundColor: on ? color : '#fff',
                        borderColor: color,
                      },
                ]}
              >
                <Text style={{ color: on && !hasArea ? '#fff' : color, fontWeight: '800', fontSize: 11 }} numberOfLines={1}>
                  {section.nombre}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {(sections || []).length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
          {sections.map((section) => {
            const on = open && String(open._id) === String(section._id);
            return (
              <Pressable
                key={`chip-${section._id}`}
                onPress={() => setOpenId(String(section._id))}
                style={[
                  styles.chip,
                  { borderColor: on ? color : theme.border, backgroundColor: on ? color : theme.surface },
                ]}
              >
                <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800' }}>{section.nombre}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: theme.surface, borderColor: theme.border }]} />
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Libre</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color, borderColor: color }]} />
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Elegido</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: theme.border, borderColor: theme.border }]} />
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ocupado</Text>
        </View>
      </View>

      {open ? (
        <View style={{ marginTop: 8 }}>
          <View style={styles.pitch}>
            <Text style={styles.pitchText}>Cancha</Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
            {open.nombre}. La fila 1 es la más cercana a la cancha. Se ven todos los asientos: pellizcá para acercar y elegir.
          </Text>
          <SeatZoom
            key={String(open._id)}
            rows={Number(open.filas) || 0}
            cols={Number(open.asientosPorFila) || 0}
            renderSeat={(fila, numero) => {
              const key = `${open._id}:${fila}:${numero}`;
              const isTaken = taken.has(key);
              const isOn = chosen.some((seat) => sameSeat(seat, { seccionId: open._id, fila, numero }));
              return { key, isTaken, isOn };
            }}
            onToggle={(fila, numero) => toggle(open, fila, numero)}
            color={color}
            theme={theme}
          />
        </View>
      ) : (
        <Text style={{ color: theme.textMuted, marginTop: 8 }}>Este evento no tiene sectores.</Text>
      )}

      <View style={styles.picked}>
        {chosen.length ? (
          chosen.map((seat) => (
            <Pressable
              key={`${seat.seccionId}-${seat.fila}-${seat.numero}`}
              onPress={() => {
                const section = (sections || []).find((item) => String(item._id) === String(seat.seccionId));
                if (section) toggle(section, seat.fila, seat.numero);
                else onChange(chosen.filter((item) => !sameSeat(item, seat)));
              }}
              style={[styles.pickedChip, { borderColor: color, backgroundColor: `${color}18` }]}
            >
              <Text style={{ color, fontWeight: '800', fontSize: 12 }}>
                {seat.seccionNombre} · Fila {seat.fila} · Asiento {seat.numero}  ×
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Todavía no elegiste un asiento.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0', borderRadius: 14, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
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
    transform: [{ translateX: -28 }, { translateY: -14 }],
    maxWidth: 96,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chips: { marginTop: 10 },
  chipsContent: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  pitch: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  pitchText: { color: '#15803d', fontWeight: '800', letterSpacing: 1, fontSize: 12 },
  board: { flexDirection: 'row', alignItems: 'flex-start' },
  zoomView: { width: '100%', overflow: 'hidden' },
  rowLabel: { width: LABEL, height: SEAT, alignItems: 'center', justifyContent: 'center' },
  seats: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  seat: {
    width: SEAT,
    height: SEAT,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pickedChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
