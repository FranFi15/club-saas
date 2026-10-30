import React from 'react';
import { View } from 'react-native';

export const MATCH_MARKS = [
  { id: 'circulo', label: 'Círculo' },
  { id: 'x', label: 'X' },
  { id: 'cuadrado', label: 'Cuadrado' },
  { id: 'triangulo', label: 'Triángulo' },
  { id: 'diamante', label: 'Diamante' },
];

export function MatchMark({ tipo = 'circulo', size = 18, color = '#fff' }) {
  const s = size;
  if (tipo === 'x') {
    return (
      <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: s, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
        <View style={{ position: 'absolute', width: s, height: 2, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
      </View>
    );
  }
  if (tipo === 'cuadrado') {
    return <View style={{ width: s * 0.75, height: s * 0.75, borderWidth: 2, borderColor: color }} />;
  }
  if (tipo === 'diamante') {
    return (
      <View
        style={{
          width: s * 0.62,
          height: s * 0.62,
          borderWidth: 2,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    );
  }
  if (tipo === 'triangulo') {
    return (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: s * 0.45,
          borderRightWidth: s * 0.45,
          borderBottomWidth: s * 0.8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: s * 0.75,
        height: s * 0.75,
        borderRadius: s,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}
