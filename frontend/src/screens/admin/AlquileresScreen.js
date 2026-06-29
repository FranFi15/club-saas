import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Modal, TextInput, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import {
  generateTimeSlots,
  getSlotStatus,
  getDayName,
  todayYmd,
  calendarPartsToYmd,
} from '../../utils/timeSlots';
import { formatJsDateToDisplay, isoCalendarWeekday } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DN = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const SLOTS = generateTimeSlots(6, 23);
const PAGO_COLOR = { pendiente: '#ef4444', señado: '#f59e0b', pagado: '#10b981' };
const PAGO_LABEL = { pendiente: 'Pendiente', señado: 'Señado', pagado: 'Pagado' };

export default function AlquileresScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';
  const spacesCacheKey = clubData?.urlIdentifier ? `admin-alquileres-spaces:${clubData.urlIdentifier}` : '';

  const [spaces, setSpaces] = useState(() => readScreenCache(spacesCacheKey)?.list ?? []);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [cancelledSessions, setCancelledSessions] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [isLoadingGrid, setIsLoadingGrid] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ nombreCliente:'', telefonoCliente:'', horaInicio:'18:00', horaFin:'19:00', montoTotal:'', señaPagada:'0' });

  // Detail bottom sheet
  const [detailRental, setDetailRental] = useState(null);

  const [alertConfig, setAlertConfig] = useState({ visible:false, title:'', message:'', showCancel:false, isDanger:false, onConfirm:()=>{}, onCancel:()=>{} });
  const showAlert = (t,m) => setAlertConfig({ visible:true, title:t, message:m, onConfirm:()=>setAlertConfig(p=>({...p,visible:false})), onCancel:()=>setAlertConfig(p=>({...p,visible:false})) });

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` };
  };

  const fetchSpacesData = useCallback(async () => {
    const h = await getHeaders();
    const r = await clubApi.get('/spaces', { headers: h });
    return { list: r.data || [] };
  }, [clubData?.urlIdentifier]);

  const applySpaces = useCallback((data) => {
    const list = data.list ?? [];
    setSpaces(list);
    setSelectedSpace((prev) => {
      if (prev && list.some((s) => String(s._id) === String(prev))) return prev;
      return list[0]?._id ?? null;
    });
  }, []);

  const { loading: isLoadingSpaces, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: spacesCacheKey,
    enabled: !!spacesCacheKey,
    fetchData: fetchSpacesData,
    onFetched: applySpaces,
    onFetchError: () => {
      showAlert('Error', 'No se pudieron cargar los espacios.');
    },
  });

  const showInitialSpacesLoader = isLoadingSpaces && spaces.length === 0;

  useEffect(() => {
    setSelectedDate(todayYmd());
  }, []);
  useEffect(() => { if (selectedSpace) fetchSchedules(); }, [selectedSpace]);
  useEffect(() => { if (selectedSpace && selectedDate) fetchDayData(); }, [selectedSpace, selectedDate]);

  const handleRefresh = () => {
    onRefresh();
    if (selectedSpace && selectedDate) fetchDayData();
  };

  const fetchSchedules = async () => {
    try {
      const h = await getHeaders();
      const r = await clubApi.get(`/schedules/espacio/${selectedSpace}`, { headers: h });
      setSchedules(r.data);
    } catch(e) { console.log('Error schedules', e); }
  };

  const fetchDayData = async () => {
    setIsLoadingGrid(true);
    try {
      const h = await getHeaders();
      const [sesRes, renRes] = await Promise.all([
        clubApi.get(
          `/sessions/espacio/${selectedSpace}?fechaInicio=${selectedDate}&fechaFin=${selectedDate}&incluirCanceladas=true`,
          { headers: h },
        ),
        clubApi.get(`/rentals/espacio/${selectedSpace}?fecha=${selectedDate}`, { headers: h }),
      ]);
      const allSessions = sesRes.data || [];
      setSessions(allSessions.filter((s) => s.estado !== 'cancelada'));
      setCancelledSessions(allSessions.filter((s) => s.estado === 'cancelada'));
      setRentals(renRes.data);
    } catch(e) { console.log('Error day data', e); }
    finally { setIsLoadingGrid(false); }
  };

  const handleSaveRental = async () => {
    if (!formData.nombreCliente || !formData.telefonoCliente || !formData.horaInicio || !formData.horaFin || !formData.montoTotal)
      return showAlert('Error','Todos los campos son obligatorios.');
    if (!isValidTimeHHMM(formData.horaInicio) || !isValidTimeHHMM(formData.horaFin))
      return showAlert('Error','Usá horarios en formato HH:MM (24 h).');
    setIsSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.post('/rentals', { ...formData, espacio: selectedSpace, fecha: selectedDate, montoTotal: Number(formData.montoTotal), señaPagada: Number(formData.señaPagada) }, { headers: h });
      fetchDayData();
      setIsModalVisible(false);
      setFormData({ nombreCliente:'', telefonoCliente:'', horaInicio:'18:00', horaFin:'19:00', montoTotal:'', señaPagada:'0' });
      showAlert('Éxito','Reserva creada correctamente.');
    } catch(error) { showAlert('Error', error.response?.data?.message || 'No se pudo crear la reserva.'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteRental = (rental) => {
    setAlertConfig({
      visible:true, title:'Cancelar Alquiler', message:`¿Cancelar la reserva de ${rental.nombreCliente}?\nSe liberará el horario.`,
      showCancel:true, isDanger:true, confirmText:'Cancelar Reserva', cancelText:'Volver',
      onConfirm: async () => {
        setAlertConfig(p=>({...p,visible:false}));
        try {
          const h = await getHeaders();
          await clubApi.delete(`/rentals/${rental._id}`, { headers: h });
          setDetailRental(null);
          fetchDayData();
          showAlert('Listo','Alquiler cancelado y horario liberado.');
        } catch(e) { showAlert('Error','No se pudo cancelar.'); }
      },
      onCancel:()=>setAlertConfig(p=>({...p,visible:false}))
    });
  };

  const openNewRental = (hora) => {
    const hi = hora || '18:00';
    const hNum = parseInt(hi.split(':')[0]);
    const hf = String(hNum+1).padStart(2,'0')+':00';
    setFormData({ nombreCliente:'', telefonoCliente:'', horaInicio:hi, horaFin:hf, montoTotal:'', señaPagada:'0' });
    setIsModalVisible(true);
  };

  // Calendar
  const getDIM = (y,m) => new Date(y,m+1,0).getDate();
  const getFD = (y,m) => new Date(y,m,1).getDay();
  const genDays = () => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const dim = getDIM(y, m);
    const fd = getFD(y, m);
    const days = [];
    for (let i = 0; i < fd; i++) days.push(null);
    for (let day = 1; day <= dim; day++) {
      days.push({ day, str: calendarPartsToYmd(y, m, day) });
    }
    return days;
  };
  const chgMonth = (o) => {
    const n = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + o, 1);
    setCurrentMonth(n);
  };
  const todayStr = todayYmd();

  // Check if date has scheduled trainings for the selected space
  const dayName = selectedDate ? getDayName(selectedDate) : '';
  const daySchedules = schedules.filter(s => s.diaSemana === dayName);

  const renderSlot = ({ item: slot }) => {
    const status = getSlotStatus(slot, sessions, rentals, daySchedules, cancelledSessions);
    let bg, icon, label, sub, onTap;

    if (status.tipo === 'alquiler') {
      const r = status.data;
      const pc = PAGO_COLOR[r.estadoPago] || '#999';
      bg = '#f59e0b18';
      icon = <Ionicons name="football-outline" size={18} color="#d97706" />;
      label = r.nombreCliente;
      sub = <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
        <View style={{backgroundColor:pc,paddingHorizontal:8,paddingVertical:2,borderRadius:10}}>
          <Text style={{color:'#fff',fontSize:10,fontWeight:'bold'}}>{PAGO_LABEL[r.estadoPago]}</Text>
        </View>
        <Text style={{color:theme.textMuted,fontSize:12}}>${r.montoTotal}</Text>
      </View>;
      onTap = () => setDetailRental(r);
    } else if (status.tipo === 'entrenamiento') {
      const s = status.data;
      bg = isDarkMode ? '#4b5563' : '#d1d5db';
      icon = <Ionicons name="fitness-outline" size={18} color={isDarkMode ? '#9ca3af' : '#6b7280'} />;
      label = s.categoria?.nombre || 'Entrenamiento';
      sub = (
        <Text style={{ color: isDarkMode ? '#d1d5db' : '#6b7280', fontSize: 12 }}>No disponible</Text>
      );
      onTap = null;
    } else {
      bg = '#10b98110';
      icon = <Ionicons name="add-circle-outline" size={18} color="#10b981" />;
      label = 'Disponible';
      sub = <Text style={{color:'#10b981',fontSize:12}}>Toque para reservar</Text>;
      onTap = () => openNewRental(slot.horaInicio);
    }

    const isUnavailable = status.tipo === 'entrenamiento';

    return (
      <TouchableOpacity disabled={!onTap} onPress={onTap} activeOpacity={0.7}
        style={[styles.slotRow, { backgroundColor: bg }]}>
        <View style={styles.slotTime}>
          <Text style={{fontWeight:'bold',fontSize:13,color:isUnavailable ? (isDarkMode ? '#e5e7eb' : '#374151') : theme.text}}>{slot.horaInicio}</Text>
          <Text style={{fontSize:10,color:isUnavailable ? (isDarkMode ? '#d1d5db' : '#6b7280') : theme.textMuted}}>{slot.horaFin}</Text>
        </View>
        <View style={[styles.slotDivider, isUnavailable && { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />
        <View style={{marginRight:10}}>{icon}</View>
        <View style={{flex:1}}>
          <Text style={{fontWeight:'600',color:isUnavailable ? (isDarkMode ? '#f3f4f6' : '#374151') : theme.text,fontSize:14}}>{label}</Text>
          {sub}
        </View>
        {status.tipo === 'alquiler' && <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={cc}
        kicker="Gestión"
        title="Reservas de canchas"
        subtitle="Alquileres externos"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={cc} />}
      >
        {showInitialSpacesLoader ? <ActivityIndicator color={cc} style={{marginTop:20}} /> : (
          <>
            <Text style={[styles.label, { color: theme.textMuted, marginBottom: 10 }]}>Seleccionar Espacio</Text>
            <FlatList horizontal showsHorizontalScrollIndicator={false} data={spaces} keyExtractor={s=>s._id}
              style={{ maxHeight:50, flexGrow:0, marginBottom:15 }}
              renderItem={({item})=>(
                <TouchableOpacity style={[styles.spaceChip, selectedSpace===item._id ? {backgroundColor:cc,borderColor:cc} : {backgroundColor:theme.background,borderColor:theme.border}]}
                  onPress={()=>setSelectedSpace(item._id)}>
                  <Text style={{color:selectedSpace===item._id?'#fff':theme.text}}>{item.nombre}</Text>
                </TouchableOpacity>
              )} />

            {/* Mini Calendar */}
            <View style={[styles.calBox, { backgroundColor: theme.surface }]}>
              <View style={styles.calHead}>
                <TouchableOpacity onPress={()=>chgMonth(-1)}><Ionicons name="chevron-back" size={22} color={theme.text}/></TouchableOpacity>
                <Text style={{fontWeight:'bold',fontSize:15,color:theme.text}}>{MN[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
                <TouchableOpacity onPress={()=>chgMonth(1)}><Ionicons name="chevron-forward" size={22} color={theme.text}/></TouchableOpacity>
              </View>
              <View style={styles.daysHeader}>{DN.map((d,i)=><Text key={i} style={[styles.dayHdrTxt,{color:theme.textMuted}]}>{d}</Text>)}</View>
              <View style={styles.daysGrid}>
                {genDays().map((dt, i) => {
                  if (!dt) return <View key={i} style={styles.dayCell} />;
                  const sel = dt.str === selectedDate;
                  const isToday = dt.str === todayStr;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.dayCell,
                        sel && { backgroundColor: cc, borderRadius: 20 },
                        !sel && isToday && { borderWidth: 2, borderColor: cc, borderRadius: 20 },
                      ]}
                      onPress={() => setSelectedDate(dt.str)}
                    >
                      <Text
                        style={[
                          { color: theme.text, textAlign: 'center' },
                          sel && { color: '#fff', fontWeight: 'bold' },
                          !sel && isToday && { color: cc, fontWeight: 'bold' },
                        ]}
                      >
                        {dt.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Time Grid */}
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                Horarios — {formatJsDateToDisplay(selectedDate) || selectedDate}
              </Text>
              {dayName ? (
                <Text style={{ fontSize: 12, color: cc, fontWeight: '600' }}>
                  {isoCalendarWeekday(selectedDate, { style: 'long' }) || dayName}
                </Text>
              ) : null}
            </View>

            {isLoadingGrid ? <ActivityIndicator color={cc} style={{marginVertical:30}} /> : (
              <View style={{paddingBottom:90}}>
                {SLOTS.map((slot,i) => (
                  <View key={i}>{renderSlot({ item: slot })}</View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: '#10b981' }]} onPress={()=>openNewRental(null)}>
        <Ionicons name="calendar-outline" size={24} color="#fff" />
      </TouchableOpacity>

      {/* New Rental Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nuevo Alquiler</Text>
              <TouchableOpacity onPress={()=>setIsModalVisible(false)}><Ionicons name="close" size={28} color={theme.icon}/></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: cc, fontWeight: 'bold', marginBottom: 15 }}>
                Fecha: {formatJsDateToDisplay(selectedDate)} — {isoCalendarWeekday(selectedDate, { style: 'long' }) || dayName}
              </Text>
              <Text style={[styles.label,{color:theme.textMuted}]}>Nombre del Cliente</Text>
              <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Ej: Juan Pérez" placeholderTextColor={theme.textMuted}
                value={formData.nombreCliente} onChangeText={v=>setFormData({...formData,nombreCliente:v})} />
              <Text style={[styles.label,{color:theme.textMuted}]}>Teléfono</Text>
              <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Ej: 1123456789" placeholderTextColor={theme.textMuted} keyboardType="phone-pad"
                value={formData.telefonoCliente} onChangeText={v=>setFormData({...formData,telefonoCliente:v})} />
              <View style={styles.row}>
                <View style={{flex:1,marginRight:10}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Hora Inicio</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="18:00" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaInicio} onChangeText={v=>setFormData({...formData,horaInicio:maskTimeHHMM(v)})} />
                </View>
                <View style={{flex:1}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Hora Fin</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="19:00" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaFin} onChangeText={v=>setFormData({...formData,horaFin:maskTimeHHMM(v)})} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={{flex:1,marginRight:10}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Monto Total ($)</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="10000" placeholderTextColor={theme.textMuted} keyboardType="numeric"
                    value={formData.montoTotal} onChangeText={v=>setFormData({...formData,montoTotal:v})} />
                </View>
                <View style={{flex:1}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Seña Pagada ($)</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="0" placeholderTextColor={theme.textMuted} keyboardType="numeric"
                    value={formData.señaPagada} onChangeText={v=>setFormData({...formData,señaPagada:v})} />
                </View>
              </View>
              <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#10b981',marginTop:15}]} onPress={handleSaveRental} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveBtnText}>Confirmar Reserva</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rental Detail Bottom Sheet */}
      <Modal visible={!!detailRental} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {detailRental && (<>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle,{color:theme.text}]}>Detalle Alquiler</Text>
                <TouchableOpacity onPress={()=>setDetailRental(null)}><Ionicons name="close" size={28} color={theme.icon}/></TouchableOpacity>
              </View>
              <View style={{alignItems:'center',marginBottom:20}}>
                <View style={{backgroundColor:PAGO_COLOR[detailRental.estadoPago]+'20',width:70,height:70,borderRadius:35,justifyContent:'center',alignItems:'center',marginBottom:10}}>
                  <Ionicons name="person" size={32} color={PAGO_COLOR[detailRental.estadoPago]}/>
                </View>
                <Text style={{fontSize:20,fontWeight:'bold',color:theme.text}}>{detailRental.nombreCliente}</Text>
                <View style={{backgroundColor:PAGO_COLOR[detailRental.estadoPago],paddingHorizontal:14,paddingVertical:4,borderRadius:12,marginTop:8}}>
                  <Text style={{color:'#fff',fontWeight:'bold',fontSize:13}}>{PAGO_LABEL[detailRental.estadoPago]}</Text>
                </View>
              </View>
              <View style={[styles.detailRow,{backgroundColor:theme.background}]}>
                <Ionicons name="call-outline" size={18} color={cc}/>
                <Text style={{color:theme.text,marginLeft:10,flex:1}}>{detailRental.telefonoCliente}</Text>
              </View>
              <View style={[styles.detailRow,{backgroundColor:theme.background}]}>
                <Ionicons name="time-outline" size={18} color={cc}/>
                <Text style={{color:theme.text,marginLeft:10,flex:1}}>{detailRental.horaInicio} a {detailRental.horaFin}</Text>
              </View>
              <View style={{flexDirection:'row',gap:10,marginBottom:15}}>
                <View style={[styles.detailRow,{backgroundColor:theme.background,flex:1}]}>
                  <Text style={{color:theme.textMuted,fontSize:12}}>Total</Text>
                  <Text style={{color:theme.text,fontWeight:'bold',fontSize:18}}>${detailRental.montoTotal}</Text>
                </View>
                <View style={[styles.detailRow,{backgroundColor:theme.background,flex:1}]}>
                  <Text style={{color:theme.textMuted,fontSize:12}}>Seña</Text>
                  <Text style={{color:'#10b981',fontWeight:'bold',fontSize:18}}>${detailRental.señaPagada}</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#ef4444'}]} onPress={()=>handleDeleteRental(detailRental)}>
                <Ionicons name="trash-outline" size={18} color="#fff" style={{marginRight:8}}/>
                <Text style={styles.saveBtnText}>Cancelar Reserva</Text>
              </TouchableOpacity>
            </>)}
          </View>
        </View>
      </Modal>

      <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText} onCancel={alertConfig.onCancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  body:{flex:1,padding:20},
  spaceChip:{paddingHorizontal:15,paddingVertical:10,borderRadius:20,borderWidth:1,marginRight:8,height:40,justifyContent:'center'},
  calBox:{borderRadius:12,padding:15,marginBottom:20,elevation:2},
  calHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:15},
  daysHeader:{flexDirection:'row',justifyContent:'space-around',marginBottom:10},
  dayHdrTxt:{width:30,textAlign:'center',fontSize:12,fontWeight:'bold'},
  daysGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start'},
  dayCell:{width:'14.28%',height:40,justifyContent:'center',alignItems:'center'},
  slotRow:{flexDirection:'row',alignItems:'center',padding:12,borderRadius:10,marginBottom:6},
  slotTime:{width:50,alignItems:'center'},
  slotDivider:{width:1,height:30,backgroundColor:'rgba(0,0,0,0.1)',marginHorizontal:10},
  fab:{position:'absolute',bottom:20,right:20,width:60,height:60,borderRadius:30,justifyContent:'center',alignItems:'center',elevation:5},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalContent:{borderTopLeftRadius:25,borderTopRightRadius:25,padding:25,paddingBottom:40,maxHeight:'85%'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  modalTitle:{fontSize:20,fontWeight:'bold'},
  label:{fontSize:13,marginBottom:5,fontWeight:'600',marginLeft:4},
  row:{flexDirection:'row',marginBottom:10},
  input:{height:48,borderWidth:1,borderRadius:12,paddingHorizontal:15,marginBottom:15},
  saveBtn:{height:50,borderRadius:12,justifyContent:'center',alignItems:'center',flexDirection:'row'},
  saveBtnText:{color:'#fff',fontSize:16,fontWeight:'bold'},
  detailRow:{padding:14,borderRadius:12,marginBottom:10,flexDirection:'row',alignItems:'center'},
});
