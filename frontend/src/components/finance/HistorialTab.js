import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatJsDateToDisplay } from '../../utils/dateDisplay';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function HistorialTab({ theme, cc, getHeaders, clubApi, showAlert }) {
  const [search, setSearch] = useState('');
  const [athletes, setAthletes] = useState([]);
  const [selectedAtleta, setSelectedAtleta] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (search.length >= 2) {
      const t = setTimeout(() => searchAthletes(), 400);
      return () => clearTimeout(t);
    } else { setAthletes([]); }
  }, [search]);

  const searchAthletes = async () => {
    setSearching(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get('/users', { headers: h, params: { rol: 'atleta', search, limit: 10 } });
      setAthletes(r.data.users || []);
    } catch(e) { console.log(e); }
    finally { setSearching(false); }
  };

  const selectAtleta = async (a) => {
    setSelectedAtleta(a); setAthletes([]); setSearch(''); setLoading(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get(`/financial/payments/atleta/${a._id}`, { headers: h });
      setHistory(r.data.payments || []); setStats(r.data.stats || {});
    } catch(e) { showAlert('Error','No se pudo cargar historial.'); }
    finally { setLoading(false); }
  };

  const fmt = (n) => `$${(n||0).toLocaleString('es-AR')}`;
  const EC = { pendiente:'#f59e0b', pagado:'#10b981', vencido:'#ef4444' };

  return (
    <ScrollView style={{flex:1,paddingHorizontal:20}} contentContainerStyle={{paddingBottom:30}} showsVerticalScrollIndicator={false}>
      {/* Search */}
      <View style={{flexDirection:'row',alignItems:'center',height:48,borderWidth:1,borderRadius:12,borderColor:theme.border,backgroundColor:theme.surface,marginTop:15,overflow:'hidden'}}>
        <Ionicons name="search" size={20} color={theme.icon} style={{marginLeft:15,marginRight:10}}/>
        <TextInput style={{flex:1,fontSize:15,color:theme.text,height:'100%'}} placeholder="Buscar atleta..." placeholderTextColor={theme.textMuted} value={search} onChangeText={setSearch}/>
        {searching && <ActivityIndicator size="small" color={cc} style={{marginRight:15}}/>}
      </View>

      {/* Results */}
      {athletes.length > 0 && (
        <View style={{borderWidth:1,borderColor:theme.border,borderRadius:12,marginTop:5,backgroundColor:theme.surface,overflow:'hidden'}}>
          {athletes.map(a=>(
            <TouchableOpacity key={a._id} style={{paddingHorizontal:15,paddingVertical:12,borderBottomWidth:1,borderBottomColor:theme.border}} onPress={()=>selectAtleta(a)}>
              <Text style={{color:theme.text,fontWeight:'500'}}>{a.nombre} {a.apellido}</Text>
              <Text style={{color:theme.textMuted,fontSize:12}}>{a.email}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Selected */}
      {selectedAtleta && (
        <>
          <View style={{backgroundColor:cc+'15',borderRadius:12,padding:15,marginTop:15,flexDirection:'row',alignItems:'center'}}>
            <Ionicons name="person-circle" size={36} color={cc}/>
            <View style={{flex:1,marginLeft:12}}>
              <Text style={{color:theme.text,fontWeight:'bold',fontSize:16}}>{selectedAtleta.nombre} {selectedAtleta.apellido}</Text>
              <Text style={{color:theme.textMuted,fontSize:12}}>{selectedAtleta.email}</Text>
            </View>
            <TouchableOpacity onPress={()=>{setSelectedAtleta(null);setHistory([]);setStats({});}}><Ionicons name="close-circle" size={24} color={theme.textMuted}/></TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={{flexDirection:'row',gap:10,marginTop:10}}>
            <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:12,alignItems:'center'}}>
              <Text style={{color:'#10b981',fontWeight:'bold',fontSize:16}}>{fmt(stats.totalPagado)}</Text>
              <Text style={{color:theme.textMuted,fontSize:10}}>Pagado</Text>
            </View>
            <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:12,alignItems:'center'}}>
              <Text style={{color:'#ef4444',fontWeight:'bold',fontSize:16}}>{fmt(stats.totalPendiente)}</Text>
              <Text style={{color:theme.textMuted,fontSize:10}}>Debe</Text>
            </View>
            <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:12,alignItems:'center'}}>
              <Text style={{color:'#f59e0b',fontWeight:'bold',fontSize:16}}>{stats.cuotasVencidas||0}</Text>
              <Text style={{color:theme.textMuted,fontSize:10}}>Vencidas</Text>
            </View>
          </View>

          {/* Timeline */}
          {loading ? <ActivityIndicator color={cc} style={{marginTop:30}}/> : (
            history.length === 0 ? (
              <View style={{alignItems:'center',marginTop:40}}>
                <Ionicons name="receipt-outline" size={50} color={theme.icon}/>
                <Text style={{color:theme.text,fontWeight:'bold',marginTop:10}}>Sin historial</Text>
              </View>
            ) : history.map((p,i)=>{
              const ec = EC[p.estado]||'#999';
              return (
                <View key={p._id} style={{flexDirection:'row',marginTop:i===0?15:0}}>
                  <View style={{alignItems:'center',width:30}}>
                    <View style={{width:10,height:10,borderRadius:5,backgroundColor:ec}}/>
                    {i<history.length-1 && <View style={{width:2,flex:1,backgroundColor:theme.border}}/>}
                  </View>
                  <View style={{flex:1,backgroundColor:theme.surface,borderRadius:12,padding:12,marginBottom:10,marginLeft:10}}>
                    <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                      <Text style={{color:theme.text,fontWeight:'600'}}>{MN[p.mes-1]} {p.anio}</Text>
                      <Text style={{color:ec,fontWeight:'bold'}}>{fmt(p.montoFinal)}</Text>
                    </View>
                    <Text style={{color:theme.textMuted,fontSize:12}}>{p.plan?.nombre||'Sin plan'}{p.categoria?.nombre?` • ${p.categoria.nombre}`:''}</Text>
                    <View style={{flexDirection:'row',alignItems:'center',marginTop:5}}>
                      <View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:8,backgroundColor:ec+'20'}}>
                        <Text style={{color:ec,fontSize:10,fontWeight:'bold',textTransform:'capitalize'}}>{p.estado}</Text>
                      </View>
                      {p.fechaPago && <Text style={{color:theme.textMuted,fontSize:10,marginLeft:8}}>Pagó: {formatJsDateToDisplay(new Date(p.fechaPago))}</Text>}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}

      {!selectedAtleta && search.length < 2 && (
        <View style={{alignItems:'center',marginTop:60}}>
          <Ionicons name="search" size={50} color={theme.icon}/>
          <Text style={{color:theme.text,fontWeight:'bold',marginTop:10,fontSize:16}}>Buscar un Atleta</Text>
          <Text style={{color:theme.textMuted,fontSize:13,marginTop:5,textAlign:'center'}}>Escribí el nombre para ver su historial de pagos completo.</Text>
        </View>
      )}
    </ScrollView>
  );
}
