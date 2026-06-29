import { Platform } from 'react-native';

/** iOS: shadow* props. Android: elevation (requires opaque backgroundColor on the same view). */
export function platformCardShadow(androidElevation = 6) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
    android: {
      elevation: androidElevation,
    },
    default: {
      elevation: androidElevation,
    },
  });
}
