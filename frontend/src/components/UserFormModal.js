// src/components/UserFormModal.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { isClubOwnerRole } from '../constants/appRoles';
import { sortUsersByName } from '../utils/listSort';
import { displayDateToIsoCalendar, isoCalendarDateToDisplay, maskDateDDMMAAAA } from '../utils/dateDisplay';
import ProfilePhotoField from './ProfilePhotoField';

export default function UserFormModal({ visible, onClose, onSave, initialData, isSaving, viewerRol = '' }) {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [formData, setFormData] = useState({
    nombre: '', apellido: '', email: '', password: '', 
    dni: '', telefono: '', rol: 'atleta', tutorPrincipal: null, fechaNacimiento: '', fotoPerfil: '',
    cuotasEnApp: true, sexo: '',
  });

  const [tutors, setTutors] = useState([]);
  const [isLoadingTutors, setIsLoadingTutors] = useState(false);
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [debouncedTutorSearch, setDebouncedTutorSearch] = useState('');
  const [showRoleSelect, setShowRoleSelect] = useState(false);

  const roles = [
    { label: 'Atleta', value: 'atleta' },
    { label: 'Profesor', value: 'profe' },
    { label: 'Preparador Físico', value: 'preparador_fisico' },
    { label: 'Nutricionista', value: 'nutricionista' },
    { label: 'Psicólogo', value: 'psicologo' },
    { label: 'Tutor', value: 'tutor' },
    { label: 'Colaborador', value: 'colaborador' },
    { label: 'Administrativo', value: 'administrativo' },
    { label: 'Administrador del club', value: 'admin_club' },
  ].filter((r) => isClubOwnerRole(viewerRol) || r.value !== 'admin_club');

  useEffect(() => {
    if (initialData) {
      setFormData({
        nombre: initialData.nombre || '',
        apellido: initialData.apellido || '',
        email: initialData.email || '',
        password: '',
        dni: initialData.dni || '',
        telefono: initialData.telefono || '',
        rol: initialData.rol || 'atleta',
        tutorPrincipal: initialData.tutorPrincipal?._id || initialData.tutorPrincipal || null,
        fechaNacimiento: (() => {
          if (!initialData.fechaNacimiento) return '';
          const ymd = String(initialData.fechaNacimiento).split('T')[0];
          return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? isoCalendarDateToDisplay(ymd) : '';
        })(),
        fotoPerfil: initialData.fotoPerfil || '',
        cuotasEnApp: initialData.cuotasEnApp !== false,
        sexo: initialData.sexo === 'M' || initialData.sexo === 'F' ? initialData.sexo : '',
      });
    } else {
      setFormData({
        nombre: '', apellido: '', email: '', password: '', dni: '', telefono: '', rol: 'atleta', tutorPrincipal: null, fechaNacimiento: '', fotoPerfil: '',
        cuotasEnApp: true, sexo: '',
      });
    }
  }, [initialData, visible]);

  // Debounce para búsqueda de tutor
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTutorSearch(tutorSearchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [tutorSearchQuery]);

  const fetchTutors = useCallback(async (search = '') => {
    const identifier = clubData?.urlIdentifier;
    if (!identifier) return;
    setIsLoadingTutors(true);
    try {
      const token = await getToken('userToken');
      const response = await clubApi.get('/users', {
        headers: { 'x-club-identifier': identifier, 'Authorization': `Bearer ${token}` },
        params: { rol: 'tutor', search: search, limit: 15 }
      });
      const list = response.data?.users;
      setTutors(sortUsersByName(Array.isArray(list) ? list : []));
    } catch (e) {
      console.log('Error al cargar tutores', e);
      setTutors([]);
    } finally {
      setIsLoadingTutors(false);
    }
  }, [clubData?.urlIdentifier]);

  // Incluye tutorPrincipal: si el modal abre con tutor asignado no cargamos lista;
  // al quitar el tutor (X) hay que volver a fetchear — antes el efecto no se disparaba.
  useEffect(() => {
    if (formData.rol === 'atleta' && visible && !formData.tutorPrincipal) {
      fetchTutors(debouncedTutorSearch);
    }
  }, [formData.rol, visible, debouncedTutorSearch, formData.tutorPrincipal, fetchTutors]);

  const handleChange = (name, value) => {
    if (name === 'rol' && value !== 'atleta') {
       setFormData(prev => ({ ...prev, rol: value, tutorPrincipal: null, cuotasEnApp: true, sexo: '' }));
    } else {
       setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFechaNacimiento = (text) => {
    setFormData((prev) => ({ ...prev, fechaNacimiento: maskDateDDMMAAAA(text) }));
  };

  const getTutorName = (id) => {
    if (!id) return 'Ninguno asignado';
    const t = tutors.find(x => x._id === id);
    if (t) return `${t.nombre} ${t.apellido}`;
    
    // Si viene la data inicial del populate
    if (initialData?.tutorPrincipal && initialData.tutorPrincipal._id === id) {
      return `${initialData.tutorPrincipal.nombre} ${initialData.tutorPrincipal.apellido}`;
    }
    return 'Ninguno asignado';
  };

  const handleSave = () => {
    let payload = { ...formData };
    if (payload.fechaNacimiento) {
      const ymd = displayDateToIsoCalendar(payload.fechaNacimiento);
      payload.fechaNacimiento = ymd || undefined;
    }
    if (payload.rol !== 'atleta') {
      delete payload.cuotasEnApp;
      delete payload.sexo;
    } else if (payload.sexo !== 'M' && payload.sexo !== 'F') {
      payload.sexo = '';
    }
    onSave(payload);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.content, { backgroundColor: theme.surface }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>
                {initialData ? 'Editar Usuario' : 'Nuevo Usuario'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

              <ProfilePhotoField
                value={formData.fotoPerfil}
                onChange={(url) => handleChange('fotoPerfil', url)}
                clubData={clubData}
                colorMarca={colorMarca}
                theme={theme}
                nombre={formData.nombre}
                apellido={formData.apellido}
              />
              
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={formData.nombre} onChangeText={(v) => handleChange('nombre', v)} placeholder="Juan" placeholderTextColor={theme.textMuted} />
              
              <Text style={[styles.label, { color: theme.textMuted }]}>Apellido *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={formData.apellido} onChangeText={(v) => handleChange('apellido', v)} placeholder="Pérez" placeholderTextColor={theme.textMuted} />
              
              <Text style={[styles.label, { color: theme.textMuted }]}>Email *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={formData.email} onChangeText={(v) => handleChange('email', v.toLowerCase())} placeholder="juan@correo.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={theme.textMuted} />
              
              {!initialData && (
                <>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Contraseña Temporal *</Text>
                  <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={formData.password} onChangeText={(v) => handleChange('password', v)} placeholder="Mínimo 6 caracteres" secureTextEntry placeholderTextColor={theme.textMuted} />
                </>
              )}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>DNI</Text>
                  <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={formData.dni} onChangeText={(v) => handleChange('dni', v)} placeholder="12345678" keyboardType="numeric" placeholderTextColor={theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Teléfono</Text>
                  <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={formData.telefono} onChangeText={(v) => handleChange('telefono', v)} placeholder="34100000" keyboardType="phone-pad" placeholderTextColor={theme.textMuted} />
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textMuted }]}>Fecha de nacimiento (DD-MM-AAAA)</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={formData.fechaNacimiento} onChangeText={handleFechaNacimiento} placeholder="DD-MM-AAAA" placeholderTextColor={theme.textMuted} keyboardType="number-pad" maxLength={10} />

              {formData.rol === 'atleta' ? (
                <>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Sexo (métricas ISAK / % grasa)</Text>
                  <View style={styles.sexoRow}>
                    {[
                      { value: 'M', label: 'Hombre' },
                      { value: 'F', label: 'Mujer' },
                    ].map((opt) => {
                      const on = formData.sexo === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.sexoChip,
                            {
                              borderColor: on ? colorMarca : theme.border,
                              backgroundColor: on ? colorMarca + '18' : theme.background,
                            },
                          ]}
                          onPress={() => handleChange('sexo', opt.value)}
                        >
                          <Text style={{ color: theme.text, fontWeight: on ? '700' : '500' }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {formData.sexo ? (
                      <TouchableOpacity onPress={() => handleChange('sexo', '')} style={styles.sexoClear}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Sin definir</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : null}

              <Text style={[styles.label, { color: theme.textMuted }]}>Rol en el Club *</Text>
              
              <View style={{ zIndex: 10, marginBottom: 15 }}>
                <TouchableOpacity 
                  style={[styles.roleSelectBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => setShowRoleSelect(!showRoleSelect)}
                >
                  <Text style={[styles.roleSelectText, { color: theme.text }]}>
                    {roles.find((r) => r.value === (formData.rol === 'control_ingreso' ? 'administrativo' : formData.rol))?.label || 'Seleccionar Rol'}
                  </Text>
                  <Ionicons name={showRoleSelect ? "chevron-up" : "chevron-down"} size={20} color={theme.icon} />
                </TouchableOpacity>

                {showRoleSelect && (
                  <View style={[styles.dropdown, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                      {roles.map(r => (
                        <TouchableOpacity key={r.value} 
                          style={[styles.dropdownItem, { 
                            borderBottomColor: theme.border,
                            backgroundColor: (formData.rol === r.value || (formData.rol === 'control_ingreso' && r.value === 'administrativo')) ? colorMarca + '15' : 'transparent' 
                          }]}
                          onPress={() => { handleChange('rol', r.value); setShowRoleSelect(false); }}>
                          <Text style={{ 
                            color: (formData.rol === r.value || (formData.rol === 'control_ingreso' && r.value === 'administrativo')) ? colorMarca : theme.text,
                            fontWeight: (formData.rol === r.value || (formData.rol === 'control_ingreso' && r.value === 'administrativo')) ? 'bold' : 'normal'
                          }}>
                            {r.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {(formData.rol === 'administrativo' || formData.rol === 'control_ingreso') && (
                <View style={[styles.switchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.switchTitle, { color: theme.text }]}>Solo escáner QR</Text>
                    <Text style={[styles.switchHint, { color: theme.textMuted }]}>
                      Si está activo, el usuario solo verá la cámara de control de ingreso al abrir la app.
                    </Text>
                  </View>
                  <Switch
                    value={formData.rol === 'control_ingreso'}
                    onValueChange={(v) => handleChange('rol', v ? 'control_ingreso' : 'administrativo')}
                    trackColor={{ false: theme.border, true: colorMarca + '88' }}
                    thumbColor={formData.rol === 'control_ingreso' ? colorMarca : theme.textMuted}
                  />
                </View>
              )}

              {/* BÚSQUEDA DE TUTOR INTEELIGENTE */}
              {formData.rol === 'atleta' && (
                <View style={{ marginTop: 5, marginBottom: 15 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Vincular Tutor </Text>
                  
                  {formData.tutorPrincipal ? (
                    <View style={[styles.tutorSelectedBox, { backgroundColor: colorMarca + '15', borderColor: colorMarca }]}>
                      <Ionicons name="person-circle" size={24} color={colorMarca} />
                      <Text style={[styles.tutorSelectText, { color: theme.text }]}>
                        {getTutorName(formData.tutorPrincipal)}
                      </Text>
                      <TouchableOpacity onPress={() => handleChange('tutorPrincipal', null)} style={{ padding: 5 }}>
                        <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Ionicons name="search" size={20} color={theme.icon} style={{ marginLeft: 15, marginRight: 10 }} />
                        <TextInput
                          style={[styles.tutorSearchInput, { color: theme.text }]}
                          placeholder="Buscar nombre o apellido del tutor..."
                          placeholderTextColor={theme.textMuted}
                          value={tutorSearchQuery}
                          onChangeText={setTutorSearchQuery}
                        />
                        {isLoadingTutors && <ActivityIndicator size="small" color={colorMarca} style={{ marginRight: 15 }} />}
                      </View>

                      {tutors.length > 0 && (
                        <View style={[styles.dropdown, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 150 }}>
                            {tutors.map(t => (
                              <TouchableOpacity key={t._id} style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                                onPress={() => handleChange('tutorPrincipal', t._id)}>
                                <Text style={{ color: theme.text, fontWeight: '500' }}>{t.nombre} {t.apellido}</Text>
                                <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t.email}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {tutors.length === 0 && !isLoadingTutors && tutorSearchQuery.length > 0 && (
                         <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 8, paddingHorizontal: 5 }}>No se encontraron tutores con ese nombre.</Text>
                      )}
                    </>
                  )}
                </View>
              )}

              {formData.rol === 'atleta' && (
                <View style={[styles.switchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.switchTitle, { color: theme.text }]}>Cuotas en la app</Text>
                    <Text style={[styles.switchHint, { color: theme.textMuted }]}>
                      Si está activo, el atleta ve Cuotas en su perfil y puede abonar (según su edad). Si no, solo un tutor puede pagar por él.
                    </Text>
                  </View>
                  <Switch
                    value={formData.cuotasEnApp}
                    onValueChange={(v) => handleChange('cuotasEnApp', v)}
                    trackColor={{ false: theme.border, true: colorMarca + '88' }}
                    thumbColor={formData.cuotasEnApp ? colorMarca : theme.textMuted}
                  />
                </View>
              )}

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colorMarca }]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{initialData ? 'Guardar Cambios' : 'Crear Usuario'}</Text>}
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 5, borderTopRightRadius: 5, padding: 25, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 5, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20 },
  label: { fontSize: 13, marginBottom: 5, fontWeight: '600', marginLeft: 4 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, marginBottom: 15 },
  row: { flexDirection: 'row' },
  
  roleSelectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15 },
  roleSelectText: { fontSize: 15 },
  
  tutorSelectedBox: { flexDirection: 'row', alignItems: 'center', height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15 },
  tutorSelectText: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tutorSearchInput: { flex: 1, fontSize: 15, height: '100%', color: '#000' },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 5, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 15,
  },
  switchTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  switchHint: { fontSize: 12, lineHeight: 17 },
  sexoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 15 },
  sexoChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  sexoClear: { paddingVertical: 8, paddingHorizontal: 4 },
  saveBtn: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});
