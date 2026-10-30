import React, { useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';
import { ClubContext } from '../context/ClubContext';

/** Escudo del club girando en profundidad, para las pantallas que todavía están cargando. */
export default function ClubSpinLoader({ size = 72, style }) {
  const { clubData } = useContext(ClubContext);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotateY = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const logoUrl = clubData?.logoUrl?.trim();
  const initial = clubData?.nombre?.charAt(0)?.toUpperCase() || '?';

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backfaceVisibility: 'visible',
          transform: [{ perspective: 900 }, { rotateY }],
        }}
      >
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: size * 0.42, fontWeight: '800', textAlign: 'center' }}>{initial}</Text>
        )}
      </Animated.View>
    </View>
  );
}
