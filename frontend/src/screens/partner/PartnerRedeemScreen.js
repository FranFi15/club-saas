import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ThemeContext } from '../../context/ThemeContext';
import { ClubContext } from '../../context/ClubContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import {
  parsePartnerMonto,
  formatPartnerMoney,
  computePartnerFinalPrice,
} from '../../utils/partnerSalePrice';

export default function PartnerRedeemScreen() {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const cc = clubData?.primaryColor || '#3b82f6';
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const cameraWidth = Math.min(width - 40, 420);
  const cameraHeight = Math.round(cameraWidth * 0.72);

  const [codigo, setCodigo] = useState('');
  const [monto, setMonto] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [alert, setAlert] = useState(null);
  const [mode, setMode] = useState('scan'); // scan | code
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraKey, setCameraKey] = useState(0);
  const [scanning, setScanning] = useState(true);
  const lastScanRef = useRef('');
  const scanLockRef = useRef(false);

  const showAlert = (title, message) => setAlert({ title, message });

  const clearPreview = useCallback(() => {
    setPreview(null);
    setMonto('');
    setScanning(true);
    lastScanRef.current = '';
  }, []);

  const authHeaders = async () => {
    const token = await getToken('userToken');
    return {
      Authorization: `Bearer ${token}`,
      'x-club-identifier': clubData?.urlIdentifier,
    };
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (isFocused && mode === 'scan') {
      setCameraKey((k) => k + 1);
      setScanning(true);
      lastScanRef.current = '';
      scanLockRef.current = false;
    }
  }, [isFocused, mode]);

  const handleRequestCamera = async () => {
    const result = await requestPermission();
    if (Platform.OS === 'web' && !result?.granted) {
      showAlert(
        'Cámara no disponible',
        'Permití el acceso a la cámara en el navegador (HTTPS). Si lo bloqueaste, habilitalo en la configuración del sitio.',
      );
    }
  };

  const processQrOrCode = useCallback(
    async (rawIn) => {
      const raw = String(rawIn || '').trim();
      if (!raw) {
        showAlert('Código', 'Ingresá el código o escaneá el QR.');
        return;
      }
      setBusy(true);
      try {
        const headers = await authHeaders();
        if (raw.toLowerCase().includes('gpsports:reward:') || raw.length > 24) {
          const { data: scanned } = await clubApi.post(
            '/loyalty/partner/scan',
            { qrValue: raw },
            { headers },
          );
          setPreview(scanned);
          setMonto('');
          setScanning(false);
          return;
        }
        const { data } = await clubApi.post(
          '/loyalty/partner/redeem-by-code',
          { codigo: raw.toUpperCase() },
          { headers },
        );
        showAlert('Listo', data.message || 'Canje validado.');
        setCodigo('');
        clearPreview();
      } catch (e) {
        showAlert('Error', e.response?.data?.message || e.message || 'No se pudo validar.');
        setScanning(true);
      } finally {
        setBusy(false);
        scanLockRef.current = false;
      }
    },
    [clubData?.urlIdentifier, clearPreview],
  );

  const onBarcodeScanned = ({ data }) => {
    if (!scanning || busy || scanLockRef.current) return;
    const value = String(data || '').trim();
    if (!value || value === lastScanRef.current) return;
    lastScanRef.current = value;
    scanLockRef.current = true;
    setScanning(false);
    processQrOrCode(value);
  };

  const rewardTipo = preview?.preview?.tipo;
  const rewardValor = preview?.preview?.valor;
  const parsedMonto = parsePartnerMonto(monto);
  const priceBreakdown =
    parsedMonto != null
      ? computePartnerFinalPrice(parsedMonto, rewardTipo, rewardValor)
      : null;

  const wantsSale = parsedMonto != null;
  const confirmScan = async () => {
    if (!preview?.redemption?._id) return;
    const dni = String(preview?.preview?.usuario?.dni || '').trim();
    const hasDni = dni.length > 0;

    if (String(monto).trim() !== '' && parsedMonto == null) {
      showAlert('Monto', 'Monto inválido. Dejalo vacío si el canje no es una compra.');
      return;
    }

    const saleAmount = wantsSale ? priceBreakdown?.final ?? parsedMonto : null;

    setBusy(true);
    try {
      const headers = await authHeaders();
      const { data: confirmData } = await clubApi.post(
        '/loyalty/partner/scan/confirm',
        { redemptionId: preview.redemption._id },
        { headers },
      );
      const canjeMsg = confirmData.message || 'Canje validado.';

      if (!wantsSale) {
        showAlert('Listo', canjeMsg);
        setCodigo('');
        clearPreview();
        return;
      }

      if (!hasDni) {
        showAlert(
          'Listo',
          `${canjeMsg} La venta no se registró: el socio no tiene DNI. Podés cargarla en la pestaña Venta.`,
        );
        setCodigo('');
        clearPreview();
        return;
      }

      try {
        const { data: saleData } = await clubApi.post(
          '/loyalty/partner/sales',
          { dni, monto: saleAmount },
          { headers },
        );
        const ventaMsg = saleData.message || 'Venta registrada.';
        showAlert('Listo', `${canjeMsg} ${ventaMsg}`);
      } catch (saleErr) {
        showAlert(
          'Canje OK, venta falló',
          `${canjeMsg} No se pudo registrar la venta: ${
            saleErr.response?.data?.message || saleErr.message || 'error'
          }. Reintentá en la pestaña Venta.`,
        );
      }
      setCodigo('');
      clearPreview();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo confirmar.');
    } finally {
      setBusy(false);
    }
  };

  const cameraReady = !!permission?.granted;
  const canRequestCamera = permission?.canAskAgain !== false;
  const showLiveCamera = cameraReady && isFocused && mode === 'scan' && !preview && !busy;

  const permissionMessage =
    Platform.OS === 'web'
      ? 'Necesitamos acceso a la cámara para escanear los QR. Tocá el botón y aceptá el permiso (HTTPS requerido).'
      : 'Necesitamos acceso a la cámara para escanear los QR de canje.';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>Canjear créditos</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          Escaneá el QR del socio o ingresá el código manualmente.
        </Text>

        <View style={styles.modeRow}>
          {[
            { key: 'scan', label: 'Escanear', icon: 'camera-outline' },
            { key: 'code', label: 'Código', icon: 'keypad-outline' },
          ].map((opt) => {
            const on = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.modeChip,
                  {
                    borderColor: on ? cc : theme.border,
                    backgroundColor: on ? `${cc}18` : theme.surface,
                  },
                ]}
                onPress={() => {
                  setMode(opt.key);
                  if (opt.key === 'scan') {
                    clearPreview();
                  }
                }}
              >
                <Ionicons name={opt.icon} size={16} color={on ? cc : theme.textMuted} />
                <Text style={{ color: on ? cc : theme.text, fontWeight: '700', fontSize: 13 }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'scan' ? (
          <View style={styles.scanBlock}>
            {!cameraReady ? (
              <View
                style={[
                  styles.permissionBox,
                  { backgroundColor: theme.surface, borderColor: theme.border, width: cameraWidth },
                ]}
              >
                {permission == null ? (
                  <ClubSpinLoader size={40} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={48} color={theme.icon} />
                    <Text style={[styles.permissionTxt, { color: theme.text }]}>{permissionMessage}</Text>
                    {canRequestCamera ? (
                      <TouchableOpacity
                        style={[styles.permissionBtn, { backgroundColor: cc }]}
                        onPress={handleRequestCamera}
                      >
                        <Text style={styles.permissionBtnTxt}>Permitir cámara</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ color: theme.textMuted, textAlign: 'center', fontSize: 13 }}>
                        El permiso fue bloqueado. Habilitá la cámara en la configuración del dispositivo.
                      </Text>
                    )}
                  </>
                )}
              </View>
            ) : (
              <View style={[styles.cameraWrap, { width: cameraWidth, height: cameraHeight }]}>
                {showLiveCamera ? (
                  <CameraView
                    key={`partner-cam-${cameraKey}`}
                    style={{ width: cameraWidth, height: cameraHeight }}
                    facing="back"
                    active={Platform.OS === 'ios' ? true : undefined}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={
                      scanning && !busy ? onBarcodeScanned : undefined
                    }
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, styles.cameraPaused]}>
                    <Ionicons name="camera-outline" size={36} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.cameraPausedTxt}>
                      {busy ? 'Verificando…' : preview ? 'QR leído' : 'Activando cámara…'}
                    </Text>
                  </View>
                )}
                {busy ? (
                  <View style={styles.cameraOverlay} pointerEvents="none">
                    <ClubSpinLoader size={36} />
                  </View>
                ) : null}
              </View>
            )}
            {preview ? (
              <TouchableOpacity
                style={{ marginTop: 10, alignSelf: 'center' }}
                onPress={() => {
                  clearPreview();
                  setCameraKey((k) => k + 1);
                }}
              >
                <Text style={{ color: cc, fontWeight: '700' }}>Escanear otro</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            <TextInput
              value={codigo}
              onChangeText={setCodigo}
              autoCapitalize="characters"
              placeholder="Código del canje"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: cc, opacity: busy ? 0.7 : 1 }]}
              onPress={() => processQrOrCode(codigo)}
              disabled={busy}
            >
              {busy ? (
                <ClubSpinLoader size={22} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.btnTxt}>Validar</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {preview?.preview ? (
          <View style={[styles.preview, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
              {preview.preview.beneficio || 'Canje'}
            </Text>
            {preview.preview.tipo === 'porcentaje' && preview.preview.valor != null ? (
              <Text style={{ color: cc, fontWeight: '600', marginTop: 4 }}>
                Descuento {preview.preview.valor}%
              </Text>
            ) : preview.preview.tipo === 'monto_fijo' && preview.preview.valor != null ? (
              <Text style={{ color: cc, fontWeight: '600', marginTop: 4 }}>
                Descuento ${formatPartnerMoney(preview.preview.valor)}
              </Text>
            ) : null}
            <Text style={{ color: theme.textMuted, marginTop: 4 }}>
              {[preview.preview.usuario?.nombre, preview.preview.usuario?.apellido]
                .filter(Boolean)
                .join(' ')}
            </Text>
            {preview.preview.usuario?.dni ? (
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                DNI {preview.preview.usuario.dni}
              </Text>
            ) : null}
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
              Estado: {preview.preview.estado}
            </Text>
            {preview.preview.estado === 'pendiente' ? (
              <>
                <Text style={[styles.montoLabel, { color: theme.textMuted }]}>
                  Monto original ($) · opcional
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 6, lineHeight: 17 }}>
                  Solo si hay compra. Dejalo vacío para canjes que no son venta.
                </Text>
                <TextInput
                  value={monto}
                  onChangeText={setMonto}
                  keyboardType="decimal-pad"
                  placeholder="Sin monto"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    styles.montoInput,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
                {priceBreakdown ? (
                  <View
                    style={[
                      styles.priceBox,
                      { backgroundColor: theme.background, borderColor: theme.border },
                    ]}
                  >
                    {priceBreakdown.discount > 0 ? (
                      <View style={styles.priceRow}>
                        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Descuento</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                          −${formatPartnerMoney(priceBreakdown.discount)}
                          {priceBreakdown.discountLabel
                            ? ` (${priceBreakdown.discountLabel})`
                            : ''}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.priceRow}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                        Precio final
                      </Text>
                      <Text style={{ color: cc, fontWeight: '800', fontSize: 18 }}>
                        ${formatPartnerMoney(priceBreakdown.final)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {wantsSale && !preview.preview.usuario?.dni ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 17 }}>
                    Sin DNI no se puede registrar la venta; se confirmará solo el canje.
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: cc, marginTop: 4, opacity: busy ? 0.7 : 1 }]}
                  onPress={confirmScan}
                  disabled={busy}
                >
                  {busy ? (
                    <ClubSpinLoader size={22} />
                  ) : (
                    <Text style={styles.btnTxt}>
                      {wantsSale && preview.preview.usuario?.dni
                        ? 'Confirmar canje y venta'
                        : 'Confirmar canje'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <CustomAlert
        visible={!!alert}
        title={alert?.title}
        message={alert?.message}
        onConfirm={() => setAlert(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scanBlock: { alignItems: 'center', marginBottom: 8 },
  permissionBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  permissionTxt: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  permissionBtn: {
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permissionBtnTxt: { color: '#fff', fontWeight: '700' },
  cameraWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  cameraPaused: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    gap: 8,
  },
  cameraPausedTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: 14,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  preview: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  montoLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  montoInput: { marginBottom: 10 },
  priceBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
