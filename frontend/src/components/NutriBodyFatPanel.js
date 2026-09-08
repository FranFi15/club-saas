import React, { useContext, useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import DesignCard from './DesignCard';
import { ThemeContext } from '../context/ThemeContext';
import { buildIsakSnapshot, computeIsakResults } from '../utils/nutriIsakCalculations';
import { activeBodyFatResult, bodyFatMethodLabel, normalizeBodyFatMethod } from '../utils/nutriBodyComposition';

/** Resultados compactos (solo números) para la pestaña Gráfico. */
export default function NutriBodyFatPanel({
  mediciones,
  defs,
  formByBlock,
  atleta,
  theme,
  isDarkMode: isDarkModeProp,
  colorMarca,
  metodoGrasaCorporal = 'durnin_siri',
}) {
  const { isDarkMode: isDarkModeCtx } = useContext(ThemeContext);
  const isDarkMode = isDarkModeProp ?? isDarkModeCtx;
  const sexo = atleta?.sexo || '';
  const edad = atleta?.edad;
  const metodo = normalizeBodyFatMethod(metodoGrasaCorporal);

  const snapshot = useMemo(
    () => buildIsakSnapshot({ mediciones, defs, formByBlock }),
    [mediciones, defs, formByBlock],
  );

  const { durnin, carter, lee, somato } = useMemo(
    () => computeIsakResults({ sexo, edad, snapshot }),
    [sexo, edad, snapshot],
  );

  const activeFat = useMemo(
    () => activeBodyFatResult({ metodo, durnin, carter }),
    [metodo, durnin, carter],
  );

  const hasAny =
    activeFat.result ||
    durnin ||
    carter ||
    lee?.muscleKg ||
    somato?.endomorphy != null;

  if (!hasAny) return null;

  const missingForMethod =
    activeFat.method === 'carter'
      ? !carter && 'Faltan los 6 pliegues Carter para calcular el % grasa.'
      : !durnin && 'Faltan los 4 pliegues Durnin para calcular el % grasa.';

  return (
    <DesignCard
      theme={theme}
      isDarkMode={isDarkMode}
      accent={colorMarca}
      contentStyle={styles.inner}
      style={styles.card}
    >
      <Text style={[styles.sectionLbl, { color: theme.textMuted }]}>% grasa corporal</Text>

      {activeFat.result ? (
        <Text style={[styles.fatLine, { color: theme.text }]}>
          {bodyFatMethodLabel(metodo)}:{' '}
          <Text style={{ color: colorMarca, fontWeight: '800' }}>
            {activeFat.result.fatPercent.toFixed(1)}%
          </Text>
        </Text>
      ) : missingForMethod ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>{missingForMethod}</Text>
      ) : null}

      {lee?.muscleKg != null ? (
        <Text style={[styles.line, { color: theme.text }]}>
          Masa muscular (Lee): <Text style={{ color: colorMarca, fontWeight: '800' }}>{lee.muscleKg.toFixed(1)} kg</Text>
        </Text>
      ) : null}
      {somato?.endomorphy != null || somato?.mesomorphy != null || somato?.ectomorphy != null ? (
        <Text style={[styles.line, { color: theme.text }]}>
          Somatotipo:{' '}
          <Text style={{ color: colorMarca, fontWeight: '800' }}>
            {somato.endomorphy ?? '—'} · {somato.mesomorphy ?? '—'} · {somato.ectomorphy ?? '—'}
          </Text>
        </Text>
      ) : null}
    </DesignCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  inner: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, gap: 8 },
  sectionLbl: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  fatLine: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  line: { fontSize: 13, lineHeight: 18 },
});
