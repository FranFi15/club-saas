import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import { clubHeaders } from '../screens/athlete/athleteApi';
import { uploadFileToClub, pickWebFile, imageFromPickerAsset } from '../utils/uploadMedia';
import PaymentPaySummary from './PaymentPaySummary';
import TransferBankInfo from './TransferBankInfo';

export default function MemberPayFlowModal({
  visible,
  onClose,
  mercadoPagoReady,
  onSelectMercadoPago,
  payments = [],
  clubData,
  theme,
  primaryColor,
  getLineLabel,
  onSuccess,
  onError,
  datosTransferencia,
}) {
  const [step, setStep] = useState('method');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const activePaymentsRef = useRef([]);
  const pickingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setStep(mercadoPagoReady ? 'method' : 'transfer');
    setProofUrl('');
    setUploading(false);
    setSubmitting(false);
    setUploadError('');
  }, [visible, mercadoPagoReady]);

  useEffect(() => {
    if (visible && payments?.length) {
      activePaymentsRef.current = payments;
    }
  }, [visible, payments]);

  const handleClose = () => {
    if (pickingRef.current) return;
    setProofUrl('');
    setUploading(false);
    setSubmitting(false);
    setUploadError('');
    activePaymentsRef.current = [];
    onClose?.();
  };

  const handleRequestClose = () => {
    if (pickingRef.current) return;
    handleClose();
  };

  const pickProof = async () => {
    setUploadError('');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      onError?.('Permiso denegado', 'Necesitamos acceso a tus fotos para subir el comprobante.');
      return;
    }

    let result;
    pickingRef.current = true;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        ...(Platform.OS === 'ios' && ImagePicker.UIImagePickerPresentationStyle
          ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }
          : {}),
      });
    } finally {
      pickingRef.current = false;
    }

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const uri = asset.uri;
      const { filename, mime } = imageFromPickerAsset(asset, uri);
      const { url } = await uploadFileToClub(clubData, uri, filename, mime, {
        webFile: pickWebFile(asset, result),
      });
      setProofUrl(url);
    } catch (e) {
      const message = e.message || 'No se pudo subir la imagen.';
      setUploadError(message);
      onError?.('Error', message);
    } finally {
      setUploading(false);
    }
  };

  const submitProof = async () => {
    const activePayments = activePaymentsRef.current.length ? activePaymentsRef.current : payments;
    if (!proofUrl) {
      onError?.('Falta el comprobante', 'Subí una foto de la transferencia antes de enviar.');
      return;
    }
    if (!activePayments.length) {
      onError?.('Error', 'No se encontraron las cuotas a pagar. Cerrá y volvé a intentar.');
      return;
    }

    setSubmitting(true);
    try {
      const h = await clubHeaders(clubData);
      if (activePayments.length === 1) {
        await clubApi.post(
          `/financial/payments/${activePayments[0]._id}/submit-transfer`,
          { comprobante: proofUrl },
          { headers: h },
        );
      } else {
        await clubApi.post(
          '/financial/payments/submit-transfer-bulk',
          { paymentIds: activePayments.map((p) => p._id), comprobante: proofUrl },
          { headers: h },
        );
      }
      handleClose();
      onSuccess?.();
    } catch (e) {
      onError?.('Error', e.response?.data?.message || e.message || 'No se pudo enviar el comprobante.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayPayments = activePaymentsRef.current.length ? activePaymentsRef.current : payments;
  const busy = uploading || submitting;
  const onlyTransfer = !mercadoPagoReady;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          {step === 'method' && mercadoPagoReady ? (
            <>
              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text }]}>Elegir forma de pago</Text>
                <TouchableOpacity onPress={handleClose} hitSlop={12}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Podés pagar con Mercado Pago o enviar el comprobante de transferencia.
              </Text>

              <TouchableOpacity
                style={[styles.option, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={onSelectMercadoPago}
              >
                <Ionicons name="card-outline" size={24} color={primaryColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, { color: theme.text }]}>Mercado Pago</Text>
                  <Text style={[styles.optionSub, { color: theme.textMuted }]}>Pago online inmediato</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.icon} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => setStep('transfer')}
              >
                <Ionicons name="swap-horizontal-outline" size={24} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, { color: theme.text }]}>Transferencia</Text>
                  <Text style={[styles.optionSub, { color: theme.textMuted }]}>
                    Subir foto del comprobante para revisión
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.icon} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.header}>
                {mercadoPagoReady ? (
                  <TouchableOpacity onPress={() => setStep('method')} hitSlop={12} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.icon} />
                  </TouchableOpacity>
                ) : null}
                <Text style={[styles.title, { color: theme.text, flex: 1 }]}>
                  {onlyTransfer ? 'Pagar por transferencia' : 'Comprobante de transferencia'}
                </Text>
                <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={busy}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <PaymentPaySummary
                  subtitle="Cuotas incluidas en el comprobante"
                  payments={displayPayments}
                  getLineLabel={getLineLabel}
                  theme={theme}
                  primaryColor={primaryColor}
                  maxListHeight={displayPayments.length > 3 ? 200 : 120}
                />

                <TransferBankInfo
                  datosTransferencia={datosTransferencia}
                  theme={theme}
                  primaryColor={primaryColor}
                />

                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Realizá la transferencia y subí una captura o foto clara del comprobante. El club lo revisará y te avisará.
                </Text>

                {uploadError ? (
                  <Text style={[styles.uploadError, { color: '#ef4444' }]}>{uploadError}</Text>
                ) : null}

                {proofUrl ? (
                  <View style={[styles.previewWrap, { borderColor: theme.border }]}>
                    <Image source={{ uri: proofUrl }} style={styles.preview} resizeMode="contain" />
                    <TouchableOpacity
                      style={[styles.changeBtn, { borderColor: theme.border }]}
                      onPress={pickProof}
                      disabled={busy}
                    >
                      <Text style={[styles.changeBtnTxt, { color: theme.text }]}>Cambiar foto</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.pickBtn, { borderColor: primaryColor, backgroundColor: primaryColor + '12' }]}
                    onPress={pickProof}
                    disabled={busy}
                  >
                    {uploading ? (
                      <ActivityIndicator color={primaryColor} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={28} color={primaryColor} />
                        <Text style={[styles.pickBtnTxt, { color: primaryColor }]}>
                          Elegir foto del comprobante
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: primaryColor, opacity: busy || !proofUrl ? 0.7 : 1 },
                  ]}
                  onPress={submitProof}
                  disabled={busy || !proofUrl}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitTxt}>Enviar a revisión</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { marginRight: 8 },
  title: { fontSize: 20, fontWeight: '800', marginRight: 12 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  uploadError: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  pickBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  pickBtnTxt: { fontSize: 15, fontWeight: '700' },
  previewWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  preview: { width: '100%', height: 220, backgroundColor: '#f3f4f6' },
  changeBtn: { paddingVertical: 10, alignItems: 'center', borderTopWidth: 1 },
  changeBtnTxt: { fontWeight: '600', fontSize: 14 },
  submitBtn: {
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
