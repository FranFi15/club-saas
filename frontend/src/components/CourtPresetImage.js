import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle, Path, G } from 'react-native-svg';
import { deporteFromPresetUrl, isCourtPresetUrl } from '../constants/courtMetrics';

const VB_W = 120;
const VB_H = 200;
const VIEWBOX = `0 0 ${VB_W} ${VB_H}`;

/** Schematic court / pool drawn with SVG for presets (no PNG assets required). */
export default function CourtPresetImage({ imagenUrl, deporte, style, width = '100%', height = 220 }) {
  const key = deporte || deporteFromPresetUrl(imagenUrl) || (isCourtPresetUrl(imagenUrl) ? null : null);
  const sport = key || 'basquet';

  return (
    <View
      style={[
        styles.wrap,
        style,
        { height },
        sport === 'basquet' && styles.wrapBasquet,
        sport === 'hockey_cesped' && styles.wrapHockey,
        sport === 'natacion' && styles.wrapPool,
        sport === 'voley' && styles.wrapVoley,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={VIEWBOX}>
        {sport === 'basquet' ? <BasquetCourt /> : null}
        {sport === 'futbol' ? <FutbolPitch /> : null}
        {sport === 'voley' ? <VoleyCourt /> : null}
        {sport === 'rugby' ? <RugbyPitch /> : null}
        {sport === 'hockey_cesped' ? <HockeyPitch /> : null}
        {sport === 'natacion' ? <NatacionPool /> : null}
        {!['basquet', 'futbol', 'voley', 'rugby', 'hockey_cesped', 'natacion'].includes(sport) ? (
          <>
            <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#1a5c3a" />
            <Rect x="8" y="8" width="104" height="184" fill="none" stroke="#f5f5f5" strokeWidth="2" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/** Hardwood court (vertical): keys, FT circles, 3-point arcs. */
function BasquetCourt() {
  const line = '#f5f5f5';
  const cx = 60;
  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#c47a3a" />
      <Rect x="6" y="6" width="108" height="188" fill="#d4894a" stroke={line} strokeWidth="2" />
      <Line x1="6" y1="100" x2="114" y2="100" stroke={line} strokeWidth="1.5" />
      <Circle cx={cx} cy="100" r="12" fill="none" stroke={line} strokeWidth="1.5" />

      {/* Top key */}
      <Rect x="38" y="6" width="44" height="32" fill="#b86a30" stroke={line} strokeWidth="1.5" />
      <Path d="M 42 38 A 14 14 0 0 0 78 38" fill="none" stroke={line} strokeWidth="1.5" />
      <Path d="M 42 38 A 14 14 0 0 1 78 38" fill="none" stroke={line} strokeWidth="1" strokeDasharray="3 2" />
      <Line x1="52" y1="6" x2="52" y2="14" stroke={line} strokeWidth="1.5" />
      <Line x1="68" y1="6" x2="68" y2="14" stroke={line} strokeWidth="1.5" />
      <Circle cx={cx} cy="12" r="2.2" fill="none" stroke={line} strokeWidth="1.2" />
      <Path d="M 18 6 L 18 22 A 42 42 0 0 0 102 22 L 102 6" fill="none" stroke={line} strokeWidth="1.5" />

      {/* Bottom key */}
      <Rect x="38" y="162" width="44" height="32" fill="#b86a30" stroke={line} strokeWidth="1.5" />
      <Path d="M 42 162 A 14 14 0 0 1 78 162" fill="none" stroke={line} strokeWidth="1.5" />
      <Path d="M 42 162 A 14 14 0 0 0 78 162" fill="none" stroke={line} strokeWidth="1" strokeDasharray="3 2" />
      <Line x1="52" y1="186" x2="52" y2="194" stroke={line} strokeWidth="1.5" />
      <Line x1="68" y1="186" x2="68" y2="194" stroke={line} strokeWidth="1.5" />
      <Circle cx={cx} cy="188" r="2.2" fill="none" stroke={line} strokeWidth="1.2" />
      <Path d="M 18 194 L 18 178 A 42 42 0 0 1 102 178 L 102 194" fill="none" stroke={line} strokeWidth="1.5" />
    </G>
  );
}

function FutbolPitch() {
  const line = '#f5f5f5';
  const cx = 60;
  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#1a5c3a" />
      <Rect x="10" y="10" width="100" height="180" fill="none" stroke={line} strokeWidth="2" />
      <Line x1="10" y1="100" x2="110" y2="100" stroke={line} strokeWidth="1.5" />
      <Circle cx={cx} cy="100" r="16" fill="none" stroke={line} strokeWidth="1.5" />
      <Circle cx={cx} cy="100" r="1.5" fill={line} />
      <Rect x="35" y="10" width="50" height="28" fill="none" stroke={line} strokeWidth="1.5" />
      <Rect x="45" y="10" width="30" height="12" fill="none" stroke={line} strokeWidth="1.2" />
      <Rect x="35" y="162" width="50" height="28" fill="none" stroke={line} strokeWidth="1.5" />
      <Rect x="45" y="178" width="30" height="12" fill="none" stroke={line} strokeWidth="1.2" />
    </G>
  );
}

/** Indoor volleyball (vertical): net + attack lines parallel to the net. */
function VoleyCourt() {
  const line = '#ffffff';
  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#1e3a5f" />
      <Rect x="12" y="20" width="96" height="160" fill="#2b6cb0" stroke={line} strokeWidth="2" />
      {/* Net (horizontal across mid) */}
      <Line x1="12" y1="100" x2="108" y2="100" stroke="#f8fafc" strokeWidth="3" />
      <Line x1="12" y1="96" x2="108" y2="96" stroke="#94a3b8" strokeWidth="0.8" opacity={0.7} />
      <Line x1="12" y1="104" x2="108" y2="104" stroke="#94a3b8" strokeWidth="0.8" opacity={0.7} />
      {/* Attack lines — parallel to net */}
      <Line x1="12" y1="70" x2="108" y2="70" stroke={line} strokeWidth="1.5" />
      <Line x1="12" y1="130" x2="108" y2="130" stroke={line} strokeWidth="1.5" />
      {/* Service zone hints */}
      <Line x1="28" y1="20" x2="28" y2="28" stroke={line} strokeWidth="1.2" />
      <Line x1="92" y1="20" x2="92" y2="28" stroke={line} strokeWidth="1.2" />
      <Line x1="28" y1="172" x2="28" y2="180" stroke={line} strokeWidth="1.2" />
      <Line x1="92" y1="172" x2="92" y2="180" stroke={line} strokeWidth="1.2" />
    </G>
  );
}

/** Rectangular rugby pitch (vertical) with 22 m, halfway, and in-goal. */
function RugbyPitch() {
  const line = '#f5f5f5';
  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#166534" />
      <Rect x="14" y="8" width="92" height="184" fill="none" stroke={line} strokeWidth="2" />
      {/* Goal lines */}
      <Line x1="14" y1="24" x2="106" y2="24" stroke={line} strokeWidth="2" />
      <Line x1="14" y1="176" x2="106" y2="176" stroke={line} strokeWidth="2" />
      {/* 22 m */}
      <Line x1="14" y1="52" x2="106" y2="52" stroke={line} strokeWidth="1.2" opacity={0.9} />
      <Line x1="14" y1="148" x2="106" y2="148" stroke={line} strokeWidth="1.2" opacity={0.9} />
      {/* 10 m dashed */}
      <Line x1="14" y1="76" x2="106" y2="76" stroke={line} strokeWidth="1" strokeDasharray="3 2" opacity={0.7} />
      <Line x1="14" y1="124" x2="106" y2="124" stroke={line} strokeWidth="1" strokeDasharray="3 2" opacity={0.7} />
      {/* Halfway */}
      <Line x1="14" y1="100" x2="106" y2="100" stroke={line} strokeWidth="1.8" />
      {/* H posts */}
      <Line x1="48" y1="24" x2="72" y2="24" stroke={line} strokeWidth="2.5" />
      <Line x1="48" y1="18" x2="72" y2="18" stroke={line} strokeWidth="1.5" />
      <Line x1="48" y1="18" x2="48" y2="24" stroke={line} strokeWidth="1.5" />
      <Line x1="72" y1="18" x2="72" y2="24" stroke={line} strokeWidth="1.5" />
      <Line x1="48" y1="176" x2="72" y2="176" stroke={line} strokeWidth="2.5" />
      <Line x1="48" y1="182" x2="72" y2="182" stroke={line} strokeWidth="1.5" />
      <Line x1="48" y1="176" x2="48" y2="182" stroke={line} strokeWidth="1.5" />
      <Line x1="72" y1="176" x2="72" y2="182" stroke={line} strokeWidth="1.5" />
    </G>
  );
}

/**
 * Field hockey (vertical) — blue pitch matching standard FIH schematic:
 * center + 23 m lines, solid D + dashed 5 m arc, goals, ticks, penalty spots.
 */
function HockeyPitch() {
  const line = '#ffffff';
  const L = 14;
  const R = 106;
  const T = 14;
  const B = 186;
  const cx = 60;
  const mid = (T + B) / 2;
  const y23a = T + (B - T) * 0.25;
  const y23b = T + (B - T) * 0.75;
  const goalW = 16;
  const goalH = 5;
  const goalX = cx - goalW / 2;
  const r = 32;
  const r5 = 40;
  const tick = 3.5;

  const sideTicksAt = (y) => (
    <G key={`st-${y}`}>
      <Line x1={L - tick} y1={y} x2={L} y2={y} stroke={line} strokeWidth="1.3" />
      <Line x1={R} y1={y} x2={R + tick} y2={y} stroke={line} strokeWidth="1.3" />
    </G>
  );

  const endTicks = (baselineY, outward) => {
    const offsets = [14, 22, 38, 46];
    return offsets.map((dx) => (
      <G key={`et-${baselineY}-${dx}`}>
        <Line
          x1={cx - dx}
          y1={baselineY}
          x2={cx - dx}
          y2={baselineY + outward * tick}
          stroke={line}
          strokeWidth="1.3"
        />
        <Line
          x1={cx + dx}
          y1={baselineY}
          x2={cx + dx}
          y2={baselineY + outward * tick}
          stroke={line}
          strokeWidth="1.3"
        />
      </G>
    ));
  };

  const strikingD = (goalY, towardCenter) => {
    const sweep = towardCenter > 0 ? 0 : 1;
    const solidSemi = `M ${cx - r} ${goalY} A ${r} ${r} 0 0 ${sweep} ${cx + r} ${goalY}`;
    const dashSemi = `M ${cx - r5} ${goalY} A ${r5} ${r5} 0 0 ${sweep} ${cx + r5} ${goalY}`;
    const spotY = goalY + towardCenter * (r * 0.45);
    return (
      <G>
        <Path d={solidSemi} fill="none" stroke={line} strokeWidth="1.6" />
        <Path
          d={dashSemi}
          fill="none"
          stroke={line}
          strokeWidth="1.3"
          strokeDasharray="2.5 2.2"
        />
        <Circle cx={cx} cy={spotY} r="1.6" fill={line} />
      </G>
    );
  };

  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#1e4d8c" />
      <Rect x={L} y={T} width={R - L} height={B - T} fill="none" stroke={line} strokeWidth="1.8" />
      {/* Center + 23 m */}
      <Line x1={L} y1={mid} x2={R} y2={mid} stroke={line} strokeWidth="1.5" />
      <Line x1={L} y1={y23a} x2={R} y2={y23a} stroke={line} strokeWidth="1.4" />
      <Line x1={L} y1={y23b} x2={R} y2={y23b} stroke={line} strokeWidth="1.4" />
      {sideTicksAt(mid)}
      {sideTicksAt(y23a)}
      {sideTicksAt(y23b)}
      {/* Corner sideline ticks */}
      {sideTicksAt(T + 8)}
      {sideTicksAt(B - 8)}
      {/* Goals (slightly outside baseline) */}
      <Rect
        x={goalX}
        y={T - goalH}
        width={goalW}
        height={goalH}
        fill="none"
        stroke={line}
        strokeWidth="1.5"
      />
      <Rect
        x={goalX}
        y={B}
        width={goalW}
        height={goalH}
        fill="none"
        stroke={line}
        strokeWidth="1.5"
      />
      {endTicks(T, -1)}
      {endTicks(B, 1)}
      {strikingD(T, 1)}
      {strikingD(B, -1)}
    </G>
  );
}

/** Top-down pool (vertical): lanes run lengthwise top→bottom. */
function NatacionPool() {
  const lanes = 6;
  const left = 14;
  const right = 106;
  const laneW = (right - left) / lanes;
  return (
    <G>
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="#0c4a6e" />
      <Rect x="10" y="12" width="100" height="176" fill="#0369a1" stroke="#e0f2fe" strokeWidth="2.5" />
      {Array.from({ length: lanes }, (_, i) => {
        const x = left + i * laneW;
        const alt = i % 2 === 0;
        return (
          <G key={i}>
            <Rect
              x={x}
              y="14"
              width={laneW}
              height="172"
              fill={alt ? '#0284c7' : '#0ea5e9'}
              opacity={0.85}
            />
            {i < lanes - 1 ? (
              <Line
                x1={x + laneW}
                y1="14"
                x2={x + laneW}
                y2="186"
                stroke="#fef08a"
                strokeWidth="1.4"
                strokeDasharray="4 3"
              />
            ) : null}
            <Line
              x1={x + laneW * 0.35}
              y1="28"
              x2={x + laneW * 0.65}
              y2="28"
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
            <Line
              x1={x + laneW * 0.5}
              y1="22"
              x2={x + laneW * 0.5}
              y2="34"
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
            <Line
              x1={x + laneW * 0.35}
              y1="172"
              x2={x + laneW * 0.65}
              y2="172"
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
            <Line
              x1={x + laneW * 0.5}
              y1="166"
              x2={x + laneW * 0.5}
              y2="178"
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
          </G>
        );
      })}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Rect
          key={`b${i}`}
          x={left + i * laneW + laneW * 0.25}
          y="8"
          width={laneW * 0.5}
          height="4"
          fill="#94a3b8"
        />
      ))}
    </G>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#14532d',
  },
  wrapBasquet: {
    backgroundColor: '#c47a3a',
  },
  wrapHockey: {
    backgroundColor: '#1e4d8c',
  },
  wrapVoley: {
    backgroundColor: '#1e3a5f',
  },
  wrapPool: {
    backgroundColor: '#0c4a6e',
  },
});
