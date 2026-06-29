import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function MorosidadTab({ theme, cc, getHeaders, clubApi, showAlert }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth()+1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => { fetchData(); }, [mes, anio]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get(`/financial/stats/morosidad?mes=${mes}&anio=${anio}`, { headers: h });
      setData(r.data);
    } catch(e) { showAlert('Error','No se pudo cargar morosidad.'); }
    finally { setLoading(false); }
  };

  const sendReminders = async () => {
    setSending(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.post('/financial/notifications/send-reminders', {}, { headers: h });
      showAlert('Éxito', r.data.message);
    } catch(e) { showAlert('Error','No se pudieron enviar.'); }
    finally { setSending(false); }
  };

  const chgMonth = (d) => {
    let m=mes+d, a=anio;
    if(m>12){m=1;a++} if(m<1){m=12;a--}
    setMes(m); setAnio(a);
  };

  const fmt = (n) => `$${(n||0).toLocaleString('es-AR')}`;

  if (loading) return <ActivityIndicator color={cc} style={{marginTop:50}}/>;
  if (!data) return null;

  const { mesActual, mesAnterior, ranking, evolucion } = data;
  const diff = mesActual.porcentajeCobranza - (mesAnterior.porcentaje || 0);

  return (
    <ScrollView style={{flex:1,paddingHorizontal:20}} contentContainerStyle={{paddingBottom:30}} showsVerticalScrollIndicator={false}>
      {/* Month */}
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:15,borderRadius:12,marginTop:15,marginBottom:10,backgroundColor:theme.surface}}>
        <TouchableOpacity onPress={()=>chgMonth(-1)}><Ionicons name="chevron-back" size={24} color={cc}/></TouchableOpacity>
        <Text style={{color:theme.text,fontWeight:'bold',fontSize:16}}>{MN[mes-1]} {anio}</Text>
        <TouchableOpacity onPress={()=>chgMonth(1)}><Ionicons name="chevron-forward" size={24} color={cc}/></TouchableOpacity>
      </View>

      {/* % Cobranza */}
      <View style={{backgroundColor:theme.surface,borderRadius:12,padding:20,marginBottom:10,alignItems:'center'}}>
        <Text style={{color:theme.textMuted,fontSize:13,marginBottom:5}}>Cobranza del Mes</Text>
        <Text style={{color:cc,fontSize:42,fontWeight:'bold'}}>{mesActual.porcentajeCobranza}%</Text>
        <View style={{width:'100%',height:8,backgroundColor:theme.border,borderRadius:4,marginTop:10}}>
          <View style={{width:`${Math.min(mesActual.porcentajeCobranza,100)}%`,height:8,backgroundColor:cc,borderRadius:4}}/>
        </View>
        <View style={{flexDirection:'row',marginTop:10,gap:5,alignItems:'center'}}>
          <Ionicons name={diff>=0?"trending-up":"trending-down"} size={16} color={diff>=0?'#10b981':'#ef4444'}/>
          <Text style={{color:diff>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:'600'}}>{diff>=0?'+':''}{diff}% vs mes anterior</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={{flexDirection:'row',gap:10,marginBottom:10}}>
        <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:15,alignItems:'center'}}>
          <Text style={{color:'#f59e0b',fontWeight:'bold',fontSize:18}}>{mesActual.pendientes}</Text>
          <Text style={{color:theme.textMuted,fontSize:11}}>Pendientes</Text>
        </View>
        <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:15,alignItems:'center'}}>
          <Text style={{color:'#ef4444',fontWeight:'bold',fontSize:18}}>{mesActual.vencidos}</Text>
          <Text style={{color:theme.textMuted,fontSize:11}}>Vencidos</Text>
        </View>
      </View>

      {/* Send reminders */}
      <TouchableOpacity style={{flexDirection:'row',justifyContent:'center',alignItems:'center',padding:14,borderRadius:12,marginBottom:15,backgroundColor:'#8b5cf6'}} onPress={sendReminders} disabled={sending}>
        {sending?<ActivityIndicator color="#fff"/>:<>
          <Ionicons name="notifications" size={18} color="#fff" style={{marginRight:8}}/>
          <Text style={{color:'#fff',fontWeight:'bold'}}>Enviar Recordatorios</Text>
        </>}
      </TouchableOpacity>

      {/* Evolución */}
      {evolucion && evolucion.length > 0 && (
        <View style={{backgroundColor:theme.surface,borderRadius:12,padding:15,marginBottom:10}}>
          <Text style={{color:theme.text,fontWeight:'bold',fontSize:14,marginBottom:10}}>Evolución (6 meses)</Text>
          {evolucion.map((e,i)=>(
            <View key={i} style={{flexDirection:'row',alignItems:'center',marginBottom:8}}>
              <Text style={{color:theme.textMuted,fontSize:12,width:60}}>{MN[e.mes-1]} {e.anio}</Text>
              <View style={{flex:1,height:6,backgroundColor:theme.border,borderRadius:3,marginHorizontal:10}}>
                <View style={{width:`${Math.min(e.porcentaje,100)}%`,height:6,backgroundColor:cc,borderRadius:3}}/>
              </View>
              <Text style={{color:theme.text,fontSize:12,fontWeight:'600',width:40,textAlign:'right'}}>{e.porcentaje}%</Text>
            </View>
          ))}
        </View>
      )}

      {/* Ranking */}
      {ranking && ranking.length > 0 && (
        <View style={{backgroundColor:theme.surface,borderRadius:12,padding:15}}>
          <Text style={{color:theme.text,fontWeight:'bold',fontSize:14,marginBottom:10}}>Ranking de Deudores</Text>
          {ranking.map((d,i)=>(
            <View key={i} style={{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:i<ranking.length-1?1:0,borderBottomColor:theme.border}}>
              <View style={{width:28,height:28,borderRadius:14,backgroundColor:i<3?'#ef444420':'#f59e0b20',justifyContent:'center',alignItems:'center',marginRight:12}}>
                <Text style={{color:i<3?'#ef4444':'#f59e0b',fontWeight:'bold',fontSize:12}}>{i+1}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={{color:theme.text,fontWeight:'500'}}>{d.atleta.nombre} {d.atleta.apellido}</Text>
                <Text style={{color:theme.textMuted,fontSize:11}}>{d.cuotasPendientes} cuota(s) sin pagar</Text>
              </View>
              <Text style={{color:'#ef4444',fontWeight:'bold'}}>{fmt(d.montoTotal)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
