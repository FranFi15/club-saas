import React, { useCallback, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { useCachedFocusLoad } from '../hooks/useCachedFocusLoad';

function fmtExpiry(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR');
  } catch {
    return '';
  }
}

/**
 * Compact credits block for profile headers: amount, then expiry under it.
 */
export default function ProfileHeaderCredits({ clubData }) {
  const cacheKey = clubData?.urlIdentifier ? `profile-header-credits:${clubData.urlIdentifier}` : '';
  const [me, setMe] = useState(() => null);

  const fetchMe = useCallback(async () => {
    if (!clubData?.urlIdentifier) return null;
    const token = await getToken('userToken');
    if (!token) return null;
    const { data } = await clubApi.get('/loyalty/me', {
      headers: {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  }, [clubData?.urlIdentifier]);

  useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchMe,
    onFetched: (data) => setMe(data || null),
    onFetchError: () => setMe(null),
  });

  if (!me?.enabled) return null;

  const nombre = me.settings?.nombrePuntos || 'Créditos';
  const balance = Number(me.balance) || 0;
  const next = me.nextExpiry;
  const expiryLine =
    next?.expiresAt && next?.remaining != null
      ? `Vencen ${next.remaining} el ${fmtExpiry(next.expiresAt)}`
      : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="circle-multiple" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.amount} numberOfLines={1}>
          {balance} {nombre}
        </Text>
      </View>
      {expiryLine ? (
        <Text style={styles.expiry} numberOfLines={1}>
          {expiryLine}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingRight: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  amount: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  expiry: {
    marginTop: 2,
    marginLeft: 20,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
});
