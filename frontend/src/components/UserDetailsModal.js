// src/components/UserDetailsModal.js
import React, { useContext, useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Linking, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import UserAvatar from './UserAvatar';


export default function UserDetailsModal({ visible, user, onClose, onEdit, onDelete }) {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [enrollments, setEnrollments] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);

  useEffect(() => {
    if (visible && user && user.rol === 'atleta') {
      fetchCategories();
    } else {
      setEnrollments([]);
    }
  }, [visible, user]);

  const fetchCategories = async () => {
    setLoadingCats(true);
    try {
       const token = await getToken('userToken');
       const response = await clubApi.get(`/enrollments/atleta/${user._id}`, {
         headers: { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` }
       });
       setEnrollments(response.data);
    } catch (e) {
       console.log('Error fetching user categories', e);
    } finally {
       setLoadingCats(false);
    }
  };

  if (!user) return null;

  const handleCall = () => {
    if (user.telefono) Linking.openURL(`tel:${user.telefono}`);
  };

  const handleEmail = () => {
    if (user.email) Linking.openURL(`mailto:${user.email}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.surface }]}>
          
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.background }]}>
            <Ionicons name="close" size={24} color={theme.icon} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            
            <View style={styles.headerProfile}>
              <UserAvatar user={user} size={80} colorMarca={colorMarca} />
              <Text style={[styles.name, { color: theme.text }]}>{user.nombre} {user.apellido}</Text>
              <View style={[styles.roleBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.roleBadgeText, { color: theme.textMuted }]}>{user.rol || 'Usuario'}</Text>
              </View>
            </View>

            <View style={styles.quickActions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.background }]} onPress={handleCall} disabled={!user.telefono}>
                <Ionicons name="call" size={20} color={user.telefono ? '#10b981' : theme.textMuted} />
                <Text style={[styles.actionText, { color: user.telefono ? theme.text : theme.textMuted }]}>Llamar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.background }]} onPress={handleEmail}>
                <Ionicons name="mail" size={20} color="#3b82f6" />
                <Text style={[styles.actionText, { color: theme.text }]}>Email</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={styles.infoRow}>
                <Ionicons name="card-outline" size={20} color={theme.icon} />
                <View style={styles.infoTextContainer}>
                  <Text style={[styles.infoLabel, { color: theme.textMuted }]}>DNI</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{user.dni || 'No registrado'}</Text>
                </View>
              </View>
              {user.rol === 'atleta' ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Ionicons name="male-female-outline" size={20} color={theme.icon} />
                    <View style={styles.infoTextContainer}>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Sexo</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>
                        {user.sexo === 'M' ? 'Hombre' : user.sexo === 'F' ? 'Mujer' : 'Sin definir'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={theme.icon} />
                <View style={styles.infoTextContainer}>
                  <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Teléfono</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{user.telefono || 'No registrado'}</Text>
                </View>
              </View>
            </View>

            {/* SECCIÓN CATEGORÍAS (Sólo Atletas) */}
            {user.rol === 'atleta' && (
              <View style={[styles.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Planteles Inscriptos</Text>
                
                {loadingCats ? (
                  <ActivityIndicator size="small" color={colorMarca} style={{ alignSelf: 'flex-start' }} />
                ) : enrollments.length > 0 ? (
                  enrollments.map((enc) => (
                    <View key={enc._id} style={styles.familyRow}>
                       <Ionicons name="football" size={16} color={colorMarca} />
                       <Text style={[styles.familyText, { color: theme.text }]}>
                         {enc.categoria.nombre} <Text style={{ color: theme.textMuted, fontSize: 13 }}>({enc.categoria.disciplina?.nombre || 'General'})</Text>
                       </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: theme.textMuted, fontSize: 14 }}>No está anotado en ninguna división.</Text>
                )}
              </View>
            )}

            {(user.tutorPrincipal || (user.familiaresACargo && user.familiaresACargo.length > 0)) && (
              <View style={[styles.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Vínculos Familiares</Text>
                
                {user.tutorPrincipal && (
                  <View style={styles.familyRow}>
                    <Ionicons name="person-outline" size={18} color={theme.icon} />
                    <Text style={[styles.familyText, { color: theme.text }]}>
                      Tutor: {user.tutorPrincipal.nombre} {user.tutorPrincipal.apellido}
                    </Text>
                  </View>
                )}

                {user.familiaresACargo && user.familiaresACargo.length > 0 && (
                  <>
                    <View style={styles.familyRow}>
                      <Ionicons name="people-outline" size={18} color={theme.icon} />
                      <Text style={[styles.familyText, { color: theme.text }]}>A cargo de:</Text>
                    </View>
                    {user.familiaresACargo.map((f, i) => (
                      <Text key={i} style={[styles.subFamilyText, { color: theme.textMuted }]}>• {f.nombre} {f.apellido} ({f.rol})</Text>
                    ))}
                  </>
                )}
              </View>
            )}

            <View style={styles.dangerZone}>
              <TouchableOpacity style={styles.editFullBtn} onPress={() => { onClose(); onEdit(user); }}>
                <Ionicons name="pencil" size={20} color="#fff" />
                <Text style={styles.editFullBtnText}> Editar Perfil</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.deleteFullBtn} onPress={() => { onClose(); onDelete(user); }}>
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.deleteFullBtnText}> Dar de Baja</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 5, borderTopRightRadius: 5, padding: 25, maxHeight: '85%' },
  closeBtn: { position: 'absolute', right: 20, top: 20, zIndex: 10, padding: 8, borderRadius: 20 },
  headerProfile: { alignItems: 'center', marginTop: 10, marginBottom: 25 },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, marginTop: 15 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  roleBadgeText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: 15, marginBottom: 25 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 15, gap: 8 },
  actionText: { fontSize: 15, fontWeight: '600' },
  infoCard: { padding: 15, borderRadius: 15, borderWidth: 1, marginBottom: 15 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoTextContainer: { marginLeft: 15 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 16, fontWeight: '500', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  familyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  familyText: { marginLeft: 10, fontSize: 15, fontWeight: '500' },
  subFamilyText: { marginLeft: 28, fontSize: 14, marginBottom: 4 },
  dangerZone: { marginTop: 10, gap: 10 },
  editFullBtn: { flexDirection: 'row', backgroundColor: '#f59e0b', padding: 15, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  editFullBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteFullBtn: { flexDirection: 'row', backgroundColor: '#ef4444', padding: 15, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  deleteFullBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
