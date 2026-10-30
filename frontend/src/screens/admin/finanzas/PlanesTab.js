import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Switch,
} from 'react-native';
import ClubSpinLoader from '../../../components/ClubSpinLoader';
import { Ionicons } from '@expo/vector-icons';
import HoverRevealSwipeable from '../../../components/HoverRevealSwipeable';
import { finanzasStyles as s } from './finanzasStyles';
import { fmtMoney, contrastOutlineBtn } from './finanzasConstants';
import CuotaSocialSection from './CuotaSocialSection';
import DesignCard from '../../../components/DesignCard';
import Foldable, { FoldableChevron } from '../../../components/Foldable';
import { ThemeContext } from '../../../context/ThemeContext';
import { clubApi } from '../../../utils/api';
import { AlertHost } from '../../../components/CustomAlert';

export default function PlanesTab({
  clubData,
  getHeaders,
  showAlert,
  canEditSocialFee,
  theme,
  primaryColor,
  plans,
  isLoadingPlans,
  disciplines,
  categories,
  isLoadingStructure,
  refreshing,
  onRefresh,
  onCreatePlan,
  onEditPlan,
  onArchivePlan,
  onReactivatePlan,
  onAssignPlan,
  isSavingAssignment,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const cc = primaryColor;
  const [planSearch, setPlanSearch] = useState('');
  const [assignSearch, setAssignSearch] = useState('');
  const [expandedDisc, setExpandedDisc] = useState({});
  const [assignTarget, setAssignTarget] = useState(null);
  const [autoGenEnabled, setAutoGenEnabled] = useState(true);
  const [autoGenLoading, setAutoGenLoading] = useState(true);
  const [autoGenSaving, setAutoGenSaving] = useState(false);

  const loadAutoGen = useCallback(async () => {
    setAutoGenLoading(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.get('/financial/auto-payment-generation', { headers });
      setAutoGenEnabled(data?.generacionAutomaticaCuotas !== false);
    } catch {
      setAutoGenEnabled(true);
    } finally {
      setAutoGenLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadAutoGen();
  }, [loadAutoGen]);

  const toggleAutoGen = async (next) => {
    if (!canEditSocialFee || autoGenSaving) return;
    const prev = autoGenEnabled;
    setAutoGenEnabled(next);
    setAutoGenSaving(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.patch(
        '/financial/auto-payment-generation',
        { generacionAutomaticaCuotas: next },
        { headers },
      );
      setAutoGenEnabled(data?.generacionAutomaticaCuotas !== false);
      showAlert?.(
        'Listo',
        data?.message ||
          (next
            ? 'Las cuotas se generarán solas el día 1 y al dar de alta o inscribir.'
            : 'Generación automática apagada. Podés generarlas o adelantarlas a mano.'),
      );
    } catch (e) {
      setAutoGenEnabled(prev);
      showAlert?.('Error', e.response?.data?.message || 'No se pudo actualizar el switch.');
    } finally {
      setAutoGenSaving(false);
    }
  };

  const activePlans = useMemo(() => plans.filter((p) => p.activo !== false), [plans]);

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) => {
      const nombre = (p.nombre || '').toLowerCase();
      const desc = (p.descripcion || '').toLowerCase();
      return nombre.includes(q) || desc.includes(q);
    });
  }, [plans, planSearch]);

  const categoriesByDiscipline = useMemo(() => {
    const map = {};
    (categories || []).forEach((cat) => {
      const did = String(cat.disciplina?._id || cat.disciplina || '');
      if (!did) return;
      if (!map[did]) map[did] = [];
      map[did].push(cat);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    });
    return map;
  }, [categories]);

  const planLabel = (planRef) => {
    if (!planRef) return null;
    if (typeof planRef === 'object' && planRef.nombre) return planRef;
    const p = plans.find((x) => String(x._id) === String(planRef));
    return p || null;
  };

  const assignQuery = assignSearch.trim().toLowerCase();

  const filteredAssignment = useMemo(() => {
    const q = assignQuery;
    return (disciplines || [])
      .map((disc) => {
        const did = String(disc._id);
        const allCats = categoriesByDiscipline[did] || [];
        if (!q) return { disc, cats: allCats, showDisciplinePlan: true, autoExpand: false };

        const discName = (disc.nombre || '').toLowerCase();
        const discPlanName = (planLabel(disc.planDefault)?.nombre || '').toLowerCase();
        const discMatches = discName.includes(q) || discPlanName.includes(q);

        const matchingCats = allCats.filter((cat) => {
          const catName = (cat.nombre || '').toLowerCase();
          const catPlanName = (planLabel(cat.planDefault)?.nombre || '').toLowerCase();
          return catName.includes(q) || catPlanName.includes(q);
        });

        if (discMatches) {
          return { disc, cats: allCats, showDisciplinePlan: true, autoExpand: true };
        }
        if (matchingCats.length) {
          return { disc, cats: matchingCats, showDisciplinePlan: false, autoExpand: true };
        }
        return null;
      })
      .filter(Boolean);
  }, [disciplines, categoriesByDiscipline, assignQuery, plans]);

  const toggleDisc = (id) => {
    const key = String(id);
    setExpandedDisc((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openAssign = (target) => {
    setAssignTarget(target);
  };

  const currentPlanId = () => {
    if (!assignTarget) return null;
    if (assignTarget.type === 'discipline') {
      const d = disciplines.find((x) => String(x._id) === String(assignTarget.id));
      return d?.planDefault?._id || d?.planDefault || null;
    }
    const c = categories.find((x) => String(x._id) === String(assignTarget.id));
    return c?.planDefault?._id || c?.planDefault || null;
  };

  const pickPlan = async (planId) => {
    if (!assignTarget) return;
    await onAssignPlan(assignTarget.type, assignTarget.id, planId);
    setAssignTarget(null);
  };

  const renderPlanCard = (item) => {
    const active = item.activo !== false;
    return (
      <HoverRevealSwipeable
        key={item._id}
        renderRightActions={() => (
          <View style={{ flexDirection: 'row', marginBottom: 14, borderRadius: 14, overflow: 'hidden' }}>
            {active ? (
              <>
                <TouchableOpacity onPress={() => onEditPlan(item)} style={[s.actionBtn, { backgroundColor: '#6b7280' }]}>
                  <Ionicons name="pencil" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onArchivePlan(item)} style={[s.actionBtn, { backgroundColor: '#ef4444' }]}>
                  <Ionicons name="trash" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => onReactivatePlan(item)} style={[s.actionBtn, { backgroundColor: '#10b981' }]}>
                  <Ionicons name="refresh" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onArchivePlan(item)} style={[s.actionBtn, { backgroundColor: '#ef4444' }]}>
                  <Ionicons name="trash" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      >
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={active ? cc : '#ef4444'}
          muted={!active}
          contentStyle={s.cardInner}
        >
          <View style={[s.planIcon, { backgroundColor: cc + '15' }]}>
            <Ionicons name="document-text-outline" size={22} color={cc} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.planName, { color: theme.text }]}>{item.nombre}</Text>
            {item.descripcion ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
                {item.descripcion}
              </Text>
            ) : null}
            {item.diaVencimiento ? (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                Vence día {item.diaVencimiento} de cada mes
                {(item.porcentajeRecargo || 0) > 0 ? ` · +${item.porcentajeRecargo}% si vence` : ''}
              </Text>
            ) : (item.porcentajeRecargo || 0) > 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                +{item.porcentajeRecargo}% si vence
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.planMonto, { color: theme.text }]}>{fmtMoney(item.monto)}</Text>
            <View style={[s.badge, { backgroundColor: active ? '#10b98120' : '#ef444420' }]}>
              <Text style={{ color: active ? '#10b981' : '#ef4444', fontSize: 10, fontWeight: 'bold' }}>
                {active ? 'Activo' : 'Archivado'}
              </Text>
            </View>
          </View>
        </DesignCard>
      </HoverRevealSwipeable>
    );
  };

  const renderAssignRow = (label, sublabel, planRef, onPress, indent) => (
    <TouchableOpacity
      style={[
        styles.assignRow,
        {
          borderColor: theme.border,
          backgroundColor: theme.surface,
          marginLeft: indent ? 14 : 0,
        },
      ]}
      onPress={onPress}
      disabled={isSavingAssignment}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.assignName, { color: theme.text }]}>{label}</Text>
        {sublabel ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{sublabel}</Text> : null}
      </View>
      <View style={styles.assignPlanWrap}>
        <Text style={[styles.assignPlan, { color: planRef ? cc : theme.textMuted }]} numberOfLines={1}>
          {planRef?.nombre || 'Sin plan'}
        </Text>
        {planRef?.monto != null ? (
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>{fmtMoney(planRef.monto)}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.icon} />
    </TouchableOpacity>
  );

  const loading = isLoadingPlans && !plans.length;

  return (
    <View style={s.tabPanel}>
      <ScrollView
        style={s.tabScroll}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={() => {
                loadAutoGen();
                onRefresh();
              }}
              tintColor={cc}
            />
          ) : undefined
        }
      >
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={cc}
          style={{ marginBottom: 16 }}
          contentStyle={styles.autoGenCard}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
              Generación automática
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
              Si está activo, se crean solas el día 1 y también al dar de alta o inscribir (mes
              actual). Apagalo si preferís generarlas o adelantarlas a mano.
            </Text>
          </View>
          {autoGenLoading || autoGenSaving ? (
            <ClubSpinLoader size={40} />
          ) : (
            <Switch
              value={autoGenEnabled}
              onValueChange={toggleAutoGen}
              disabled={!canEditSocialFee}
              trackColor={{ true: `${cc}99`, false: '#9ca3af55' }}
              thumbColor={autoGenEnabled ? cc : '#f4f4f5'}
            />
          )}
        </DesignCard>

        <CuotaSocialSection
          clubData={clubData}
          theme={theme}
          primaryColor={cc}
          getHeaders={getHeaders}
          showAlert={showAlert}
          canEdit={canEditSocialFee}
        />

        <View style={{ marginTop: 24, marginBottom: 10 }}>
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 4 }]}>Cuotas y Planes</Text>
          <Text style={[s.sectionSub, { color: theme.textMuted, marginBottom: 0 }]}>
            Creá y editá los montos. Luego asignalos a cada disciplina o categoría.
          </Text>
        </View>

        <View style={styles.toolbar}>
          {canEditSocialFee ? (
            <TouchableOpacity
              style={[styles.toolbarBtn, contrastOutlineBtn(theme, isDarkMode)]}
              onPress={onCreatePlan}
            >
              <Ionicons name="add" size={16} color={theme.text} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Nuevo plan</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar plan..."
            placeholderTextColor={theme.textMuted}
            value={planSearch}
            onChangeText={setPlanSearch}
            autoCorrect={false}
          />
          {planSearch ? (
            <TouchableOpacity onPress={() => setPlanSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <ClubSpinLoader size={56} style={{ marginTop: 30 }} />
        ) : filteredPlans.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={50} color={theme.icon} />
            <Text style={[s.emptyTxt, { color: theme.text }]}>{planSearch ? 'Sin resultados' : 'Sin planes'}</Text>
            <Text style={[s.emptySub, { color: theme.textMuted }]}>
              {planSearch ? 'Probá otro nombre.' : 'Creá el primero con “Nuevo plan”.'}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>{filteredPlans.map(renderPlanCard)}</View>
        )}

        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 24 }]}>Asignación</Text>
        <Text style={[s.sectionSub, { color: theme.textMuted, marginBottom: 10 }]}>
          Al inscribir un atleta se usa el plan de la categoría; si no tiene, el de la disciplina.
        </Text>

        <View
          style={[
            styles.searchRow,
            { backgroundColor: theme.background, borderColor: theme.border, marginBottom: 12 },
          ]}
        >
          <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar disciplina, categoría o plan..."
            placeholderTextColor={theme.textMuted}
            value={assignSearch}
            onChangeText={setAssignSearch}
            autoCorrect={false}
          />
          {assignSearch ? (
            <TouchableOpacity onPress={() => setAssignSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          ) : null}
        </View>

        {isLoadingStructure && !disciplines.length ? (
          <ClubSpinLoader size={40} style={{ marginTop: 20 }} />
        ) : disciplines.length === 0 ? (
          <View style={[s.empty, { marginTop: 10 }]}>
            <Text style={[s.emptySub, { color: theme.textMuted }]}>No hay disciplinas cargadas.</Text>
          </View>
        ) : filteredAssignment.length === 0 ? (
          <View style={[s.empty, { marginTop: 16 }]}>
            <Ionicons name="search-outline" size={40} color={theme.icon} />
            <Text style={[s.emptyTxt, { color: theme.text, marginTop: 8 }]}>Sin resultados</Text>
            <Text style={[s.emptySub, { color: theme.textMuted }]}>Probá otro nombre de disciplina, categoría o plan.</Text>
          </View>
        ) : (
          filteredAssignment.map(({ disc, cats, showDisciplinePlan, autoExpand }) => {
            const did = String(disc._id);
            const open = autoExpand || !!expandedDisc[did];
            const discPlan = planLabel(disc.planDefault);

            return (
              <View key={did} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.discHeader, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => toggleDisc(did)}
                >
                  <FoldableChevron open={open} color={theme.text} size={18} />
                  <Text style={[styles.discTitle, { color: theme.text, flex: 1 }]}>{disc.nombre}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {cats.length} cat.{assignQuery ? ' · filtrado' : ''}
                  </Text>
                </TouchableOpacity>

                {showDisciplinePlan
                  ? renderAssignRow(
                      'Plan de la disciplina',
                      'Fallback si la categoría no tiene plan',
                      discPlan,
                      () => openAssign({ type: 'discipline', id: disc._id, label: disc.nombre }),
                      false
                    )
                  : null}

                <Foldable open={open}>
                  {cats.map((cat) =>
                      renderAssignRow(
                        cat.nombre,
                        null,
                        planLabel(cat.planDefault),
                        () => openAssign({ type: 'category', id: cat._id, label: `${disc.nombre} · ${cat.nombre}` }),
                        true
                      )
                    )}
                  {cats.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 14, marginBottom: 8 }}>
                      Sin categorías en esta disciplina.
                    </Text>
                  ) : null}
                </Foldable>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!assignTarget} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                Plan · {assignTarget?.label || ''}
              </Text>
              <TouchableOpacity onPress={() => setAssignTarget(null)} disabled={isSavingAssignment}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              {[{ _id: null, nombre: 'Sin plan', monto: 0 }, ...activePlans].map((p, idx) => {
                const selId = currentPlanId();
                const isSel = (p._id || null) === (selId || null);
                return (
                  <TouchableOpacity
                    key={p._id || `none-${idx}`}
                    style={[
                      styles.planPickItem,
                      { borderBottomColor: theme.border, backgroundColor: isSel ? cc + '12' : 'transparent' },
                    ]}
                    onPress={() => pickPlan(p._id || null)}
                    disabled={isSavingAssignment}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{p.nombre}</Text>
                      {p._id ? <Text style={{ color: theme.textMuted, marginTop: 2 }}>{fmtMoney(p.monto)}</Text> : null}
                    </View>
                    {isSel ? (
                      <Ionicons name="checkmark-circle" size={22} color={cc} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color={theme.icon} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {!activePlans.length ? (
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginVertical: 20 }}>
                  Creá al menos un plan activo antes de asignar.
                </Text>
              ) : null}
            </ScrollView>

            {isSavingAssignment ? <ClubSpinLoader size={40} style={{ marginTop: 12 }} /> : null}
          </View>
          <AlertHost active={!!assignTarget} />
        </View>
      </Modal>
    </View>
  );
}

const styles = {
  autoGenCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 15 },
  discHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 6,
  },
  discTitle: { fontSize: 15, fontWeight: '700' },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  assignName: { fontSize: 14, fontWeight: '600' },
  assignPlanWrap: { alignItems: 'flex-end', maxWidth: 120 },
  assignPlan: { fontSize: 13, fontWeight: '600' },
  planPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
};
