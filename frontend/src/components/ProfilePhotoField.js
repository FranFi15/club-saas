import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import { uploadFileToClub } from '../utils/uploadMedia';

/**
 * Selector y vista previa de foto de perfil (sube a Cloudinary vía /api/upload).
 */
export default function ProfilePhotoField({
  value = '',
  onChange,
  clubData,
  colorMarca = '#3b82f6',
  theme,
  nombre = '',
  apellido = '',
  size = 96,
  label = 'Foto de perfil',
}) {
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const uri = asset.uri;
      const filename = uri.split('/').pop() || 'perfil.jpg';
      const ext = (filename.split('.').pop() || 'jpg').replace('jpg', 'jpeg');
      const mime = asset.mimeType || `image/${ext}`;
      const { url } = await uploadFileToClub(clubData, uri, filename, mime);
      onChange?.(url);
    } catch (e) {
      console.log('Profile photo upload error', e);
    } finally {
      setUploading(false);
    }
  };

  const clearPhoto = () => onChange?.('');

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme?.textMuted || '#6b7280' }]}>{label}</Text>
      <View style={styles.row}>
        <UserAvatar
          nombre={nombre}
          apellido={apellido}
          fotoPerfil={value}
          size={size}
          colorMarca={colorMarca}
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colorMarca }]}
            onPress={pickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={styles.btnTxt}>{value ? 'Cambiar' : 'Elegir foto'}</Text>
              </>
            )}
          </TouchableOpacity>
          {value ? (
            <TouchableOpacity style={styles.clearBtn} onPress={clearPhoto} disabled={uploading}>
              <Text style={[styles.clearTxt, { color: theme?.textMuted || '#6b7280' }]}>Quitar foto</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 8, fontWeight: '600', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flex: 1, gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  clearTxt: { fontSize: 13, fontWeight: '600' },
});
