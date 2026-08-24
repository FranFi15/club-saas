import express from 'express';
import {
    createPlan,
    getPlans,
    updatePlan,
    deletePlan,
    reactivatePlan,
    generarCuotasMes,
    getAllPayments,
    getPaymentStats,
    registerManualPayment,
    registerBulkManualPayment,
    getTutorFamilyPayments,
    getAtletaPayments,
    getPaymentReceipt,
    getSiblings,
    applySiblingDiscount,
    getGlobalFamilyDiscount,
    updateGlobalFamilyDiscount,
    getTransferBankSettings,
    updateTransferBankSettings,
    checkOverdue,
    adjustPayment,
    getMorosidad,
    sendReminders,
    submitTransferProof,
    submitBulkTransferProof,
    getPendingTransferReviews,
    approveTransferReviewBatch,
    rejectTransferReviewBatch,
    approveTransferPayment,
    rejectTransferPayment,
} from '../controllers/financial.controller.js';
import {
    listPayrollStaff,
    listPayrollEntries,
    createPayrollEntry,
    updatePayrollEntry,
    deletePayrollEntry,
    listBills,
    createBill,
    updateBill,
    payBill,
    deleteBill,
} from '../controllers/payrollBills.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Planes de pago
router.get('/plans', protect, authorize('admin_club', 'administrativo'), getPlans);
router.post('/plans', protect, authorize('admin_club'), createPlan);
router.put('/plans/:id', protect, authorize('admin_club'), updatePlan); // Para actualizar precios
router.delete('/plans/:id', protect, authorize('admin_club'), deletePlan); // Baja lógica (activo: false)
router.patch('/plans/:id/reactivate', protect, authorize('admin_club'), reactivatePlan);

// Movimientos de dinero
router.get('/payments', protect, authorize('admin_club', 'administrativo'), getAllPayments);
router.get('/payments/stats', protect, authorize('admin_club', 'administrativo'), getPaymentStats);
router.post('/payments/generate', protect, authorize('admin_club', 'administrativo'), generarCuotasMes);
router.post('/payments/check-overdue', protect, authorize('admin_club', 'administrativo'), checkOverdue);
router.get('/payments/pending-review', protect, authorize('admin_club', 'administrativo'), getPendingTransferReviews);
router.patch('/payments/transfer-review/approve', protect, authorize('admin_club', 'administrativo'), approveTransferReviewBatch);
router.patch('/payments/transfer-review/reject', protect, authorize('admin_club', 'administrativo'), rejectTransferReviewBatch);
router.post('/payments/submit-transfer-bulk', protect, authorize('atleta', 'tutor'), submitBulkTransferProof);
router.patch('/payments/pay-bulk', protect, authorize('admin_club', 'administrativo'), registerBulkManualPayment);
router.post('/payments/:id/submit-transfer', protect, authorize('atleta', 'tutor'), submitTransferProof);
router.patch('/payments/:id/approve-transfer', protect, authorize('admin_club', 'administrativo'), approveTransferPayment);
router.patch('/payments/:id/reject-transfer', protect, authorize('admin_club', 'administrativo'), rejectTransferPayment);
router.patch('/payments/:id/pay', protect, authorize('admin_club', 'administrativo'), registerManualPayment);
router.patch('/payments/:id/adjust', protect, authorize('admin_club', 'administrativo'), adjustPayment);
router.get('/payments/tutor-family', protect, authorize('tutor'), getTutorFamilyPayments);
router.get('/payments/atleta/:atletaId', protect, getAtletaPayments);
router.get('/payments/:id/recibo', protect, getPaymentReceipt);

// Hermanos y descuentos
router.get('/family-discount/global', protect, authorize('admin_club', 'administrativo'), getGlobalFamilyDiscount);
router.patch('/family-discount/global', protect, authorize('admin_club'), updateGlobalFamilyDiscount);
router.get('/transfer-bank', protect, authorize('admin_club', 'administrativo'), getTransferBankSettings);
router.patch('/transfer-bank', protect, authorize('admin_club'), updateTransferBankSettings);
router.get('/siblings', protect, authorize('admin_club', 'administrativo'), getSiblings);
router.patch('/siblings/discount', protect, authorize('admin_club'), applySiblingDiscount);

// Dashboard de morosidad
router.get('/stats/morosidad', protect, authorize('admin_club', 'administrativo'), getMorosidad);

// Notificaciones / Recordatorios
router.post('/notifications/send-reminders', protect, authorize('admin_club', 'administrativo'), sendReminders);

// Nómina
router.get('/payroll/staff', protect, authorize('admin_club'), listPayrollStaff);
router.get('/payroll', protect, authorize('admin_club'), listPayrollEntries);
router.post('/payroll', protect, authorize('admin_club'), createPayrollEntry);
router.patch('/payroll/:id', protect, authorize('admin_club'), updatePayrollEntry);
router.delete('/payroll/:id', protect, authorize('admin_club'), deletePayrollEntry);

// Gastos / facturas
router.get('/bills', protect, authorize('admin_club'), listBills);
router.post('/bills', protect, authorize('admin_club'), createBill);
router.patch('/bills/:id/pay', protect, authorize('admin_club'), payBill);
router.patch('/bills/:id', protect, authorize('admin_club'), updateBill);
router.delete('/bills/:id', protect, authorize('admin_club'), deleteBill);

export default router;