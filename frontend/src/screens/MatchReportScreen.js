import React, { useCallback, useContext, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ClubSpinLoader from '../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import CoachScreenHeader from '../components/CoachScreenHeader';
import MatchCourtBoard from '../components/MatchCourtBoard';
import { sumsOnlyTotals } from '../utils/matchDerive';

function filaText(fila, campos) {
  if (fila.campo?.tipo === 'limite') {
    const limite = Number(fila.campo.limite) || 0;
    return `${fila.campo?.etiqueta}: ${fila.anoto}${limite ? `/${limite}` : ''}`;
  }
  if (sumsOnlyTotals(fila.campo, campos)) return `${fila.campo?.etiqueta}: ${fila.anoto}`;
  return `${fila.campo?.etiqueta}: ${fila.anoto}/${fila.anoto + fila.erro}${fila.porcentaje == null ? '' : ` (${fila.porcentaje}%)`}`;
}

function clockLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function MatchReportScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const sessionId = route.params?.sessionId;
  const [informe, setInforme] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = await getToken('userToken');
    const h = { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
    const { data } = await clubApi.get(`/sessions/${sessionId}/informe`, { headers: h });
    setInforme(data);
  }, [clubData?.urlIdentifier, sessionId]);

  React.useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'No se pudo abrir el informe.'));
  }, [load]);

  const persona = informe?.personas?.[0];
  const marks = (informe?.personas || []).flatMap((row) => row.jugadas || []).map((play) => {
    const campo = (informe?.campos || []).find((item) => String(item._id) === String(play.campoId));
    return {
      x: play.x,
      y: play.y,
      icono: play.resultado === 'anoto' ? campo?.iconoAnoto : campo?.iconoErro,
      color: play.resultado === 'anoto' ? '#22c55e' : '#ef4444',
    };
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Informe"
        title={informe?.nombre || 'Partido'}
        onBack={() => navigation.goBack()}
      />
      {!informe && !error ? <ClubSpinLoader size={40} style={{ marginTop: 24 }} /> : null}
      {error ? <Text style={{ color: '#ef4444', padding: 16 }}>{error}</Text> : null}
      {informe ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22 }}>
            {informe.marcador?.nosotros || 0}{informe.rival ? ` - ${informe.marcador?.rival || 0}` : ''}
          </Text>
          {informe.contarPosesion === false ? null : (
            <>
              <Text style={{ color: theme.text }}>
                Nosotros {informe.posesion?.nosotros?.cantidad || 0} posesiones · {clockLabel(informe.posesion?.nosotros?.segundos)}
              </Text>
              <Text style={{ color: theme.text }}>
                Rival {informe.posesion?.rival?.cantidad || 0} posesiones · {clockLabel(informe.posesion?.rival?.segundos)}
              </Text>
            </>
          )}
          {persona && (informe.personas || []).length === 1 ? (
            <Text style={{ color: theme.text, fontWeight: '800' }}>
              {persona.nombre} · en cancha {clockLabel(persona.segundos)}
            </Text>
          ) : null}
          {(persona?.filas || informe.partidoFilas || []).map((fila) => (
            <Text key={String(fila.campo?._id)} style={{ color: theme.text }}>
              {filaText(fila, informe.campos)}
            </Text>
          ))}
          {(informe.personas || []).length > 1
            ? informe.personas.map((row) => (
                <View key={row.usuario}>
                  <Text style={{ color: theme.text, fontWeight: '700', marginTop: 8 }}>
                    {row.nombre} · {clockLabel(row.segundos)}
                  </Text>
                  {row.filas.map((fila) => (
                    <Text key={String(fila.campo?._id)} style={{ color: theme.textMuted }}>
                      {filaText(fila, informe.campos)}
                    </Text>
                  ))}
                </View>
              ))
            : null}
          {informe.cancha ? (
            <View style={{ marginTop: 12 }}>
              <MatchCourtBoard
                imagenUrl={informe.cancha.imagenUrl}
                deporte={informe.cancha.deporte}
                horizontal
                height={220}
                theme={theme}
                marks={marks}
                logoUrl={clubData?.logoUrl || ''}
                onTap={() => {}}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
