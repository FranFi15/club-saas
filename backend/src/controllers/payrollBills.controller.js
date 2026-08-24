import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { parsePageLimit, paginationMeta, escapeRegex } from '../utils/pagination.js';
import { PAYROLL_STAFF_ROLES, PAYROLL_METODOS } from '../models/payroll.model.js';
import { BILL_METODOS } from '../models/bill.model.js';

function parsePositiveMoney(value, fieldLabel = 'Monto') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        const err = new Error(`${fieldLabel} inválido.`);
        err.statusCode = 400;
        throw err;
    }
    return Math.round(n * 100) / 100;
}

function parsePeriod(mes, anio) {
    const m = Number(mes);
    const a = Number(anio);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
        const err = new Error('Mes inválido (1-12).');
        err.statusCode = 400;
        throw err;
    }
    if (!Number.isInteger(a) || a < 2000 || a > 2100) {
        const err = new Error('Año inválido.');
        err.statusCode = 400;
        throw err;
    }
    return { mes: m, anio: a };
}

function parseMetodo(value, allowed, required = true) {
    if (value == null || value === '') {
        if (required) {
            const err = new Error('Método de pago requerido.');
            err.statusCode = 400;
            throw err;
        }
        return undefined;
    }
    if (!allowed.includes(value)) {
        const err = new Error('Método de pago inválido.');
        err.statusCode = 400;
        throw err;
    }
    return value;
}

function parseOptionalDate(value) {
    if (value == null || value === '') return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        const err = new Error('Fecha inválida.');
        err.statusCode = 400;
        throw err;
    }
    return d;
}

function staffName(u) {
    if (!u) return '';
    return `${u.nombre || ''} ${u.apellido || ''}`.trim();
}

// ——— Payroll ———

const listPayrollStaff = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const staff = await User.find({
        rol: { $in: PAYROLL_STAFF_ROLES },
        estado: { $ne: 'inactivo' },
    })
        .select('nombre apellido email rol')
        .sort({ apellido: 1, nombre: 1 })
        .lean();

    res.json({
        staff: staff.map((u) => ({
            ...u,
            displayName: staffName(u),
        })),
    });
});

const listPayrollEntries = asyncHandler(async (req, res) => {
    const { PayrollEntry } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 40, maxLimit: 100 });
    const filter = {};

    if (req.query.staff && mongoose.isValidObjectId(req.query.staff)) {
        filter.staff = req.query.staff;
    }
    if (req.query.mes) {
        const m = Number(req.query.mes);
        if (Number.isInteger(m) && m >= 1 && m <= 12) filter.mes = m;
    }
    if (req.query.anio) {
        const a = Number(req.query.anio);
        if (Number.isInteger(a)) filter.anio = a;
    }

    const [rows, total] = await Promise.all([
        PayrollEntry.find(filter)
            .populate('staff', 'nombre apellido email rol')
            .populate('registradoPor', 'nombre apellido')
            .sort({ anio: -1, mes: -1, fechaPago: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        PayrollEntry.countDocuments(filter),
    ]);

    res.json({
        entries: rows,
        ...paginationMeta(page, limit, total),
    });
});

const createPayrollEntry = asyncHandler(async (req, res) => {
    const { PayrollEntry, User } = req.models;
    const { staffId, monto, mes, anio, fechaPago, metodoPago, comprobanteUrl, notas } = req.body || {};

    if (!staffId || !mongoose.isValidObjectId(staffId)) {
        res.status(400);
        throw new Error('Personal inválido.');
    }

    const staff = await User.findById(staffId).select('rol nombre apellido');
    if (!staff) {
        res.status(404);
        throw new Error('Persona no encontrada.');
    }
    if (!PAYROLL_STAFF_ROLES.includes(staff.rol)) {
        res.status(400);
        throw new Error('Esa persona no es personal del club.');
    }

    const period = parsePeriod(mes, anio);
    const entry = await PayrollEntry.create({
        staff: staffId,
        monto: parsePositiveMoney(monto),
        mes: period.mes,
        anio: period.anio,
        fechaPago: parseOptionalDate(fechaPago) || new Date(),
        metodoPago: parseMetodo(metodoPago || 'transferencia', PAYROLL_METODOS),
        comprobanteUrl: String(comprobanteUrl || '').trim(),
        notas: String(notas || '').trim(),
        registradoPor: req.user._id,
    });

    const populated = await PayrollEntry.findById(entry._id)
        .populate('staff', 'nombre apellido email rol')
        .populate('registradoPor', 'nombre apellido')
        .lean();

    res.status(201).json(populated);
});

const updatePayrollEntry = asyncHandler(async (req, res) => {
    const { PayrollEntry } = req.models;
    const entry = await PayrollEntry.findById(req.params.id);
    if (!entry) {
        res.status(404);
        throw new Error('Pago de nómina no encontrado.');
    }

    const { monto, mes, anio, fechaPago, metodoPago, comprobanteUrl, notas } = req.body || {};

    if (monto !== undefined) entry.monto = parsePositiveMoney(monto);
    if (mes !== undefined || anio !== undefined) {
        const period = parsePeriod(mes ?? entry.mes, anio ?? entry.anio);
        entry.mes = period.mes;
        entry.anio = period.anio;
    }
    if (fechaPago !== undefined) {
        entry.fechaPago = parseOptionalDate(fechaPago) || entry.fechaPago;
    }
    if (metodoPago !== undefined) {
        entry.metodoPago = parseMetodo(metodoPago, PAYROLL_METODOS);
    }
    if (comprobanteUrl !== undefined) {
        entry.comprobanteUrl = String(comprobanteUrl || '').trim();
    }
    if (notas !== undefined) entry.notas = String(notas || '').trim();

    await entry.save();
    const populated = await PayrollEntry.findById(entry._id)
        .populate('staff', 'nombre apellido email rol')
        .populate('registradoPor', 'nombre apellido')
        .lean();
    res.json(populated);
});

const deletePayrollEntry = asyncHandler(async (req, res) => {
    const { PayrollEntry } = req.models;
    const entry = await PayrollEntry.findByIdAndDelete(req.params.id);
    if (!entry) {
        res.status(404);
        throw new Error('Pago de nómina no encontrado.');
    }
    res.json({ message: 'Pago eliminado.', id: entry._id });
});

// ——— Bills ———

const listBills = asyncHandler(async (req, res) => {
    const { Bill } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 40, maxLimit: 100 });
    const filter = {};

    if (req.query.estado && ['pendiente', 'pagado'].includes(req.query.estado)) {
        filter.estado = req.query.estado;
    }

    const search = String(req.query.search || '').trim();
    if (search) {
        filter.concepto = { $regex: escapeRegex(search), $options: 'i' };
    }

    const mes = Number(req.query.mes);
    const anio = Number(req.query.anio);
    if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(anio) && anio >= 2000) {
        const from = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
        const to = new Date(anio, mes, 1, 0, 0, 0, 0);
        filter.fecha = { $gte: from, $lt: to };
    }

    const [rows, total] = await Promise.all([
        Bill.find(filter)
            .populate('registradoPor', 'nombre apellido')
            .sort({ fecha: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Bill.countDocuments(filter),
    ]);

    res.json({
        bills: rows,
        ...paginationMeta(page, limit, total),
    });
});

const createBill = asyncHandler(async (req, res) => {
    const { Bill } = req.models;
    const {
        concepto,
        monto,
        fecha,
        facturaUrl,
        notas,
        pagarAhora,
        metodoPago,
        pagoComprobanteUrl,
        fechaPago,
    } = req.body || {};

    const conceptoTrim = String(concepto || '').trim();
    if (!conceptoTrim) {
        res.status(400);
        throw new Error('Concepto requerido.');
    }

    const payload = {
        concepto: conceptoTrim,
        monto: parsePositiveMoney(monto),
        fecha: parseOptionalDate(fecha) || new Date(),
        facturaUrl: String(facturaUrl || '').trim(),
        notas: String(notas || '').trim(),
        registradoPor: req.user._id,
        estado: 'pendiente',
    };

    const shouldPay =
        pagarAhora === true ||
        pagarAhora === 'true' ||
        (metodoPago && String(metodoPago).trim());

    if (shouldPay) {
        payload.estado = 'pagado';
        payload.metodoPago = parseMetodo(metodoPago || 'transferencia', BILL_METODOS);
        payload.fechaPago = parseOptionalDate(fechaPago) || new Date();
        payload.pagoComprobanteUrl = String(pagoComprobanteUrl || '').trim();
    }

    const bill = await Bill.create(payload);
    const populated = await Bill.findById(bill._id)
        .populate('registradoPor', 'nombre apellido')
        .lean();
    res.status(201).json(populated);
});

const updateBill = asyncHandler(async (req, res) => {
    const { Bill } = req.models;
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
        res.status(404);
        throw new Error('Factura no encontrada.');
    }

    const { concepto, monto, fecha, facturaUrl, notas } = req.body || {};

    if (concepto !== undefined) {
        const c = String(concepto).trim();
        if (!c) {
            res.status(400);
            throw new Error('Concepto requerido.');
        }
        bill.concepto = c;
    }
    if (monto !== undefined) bill.monto = parsePositiveMoney(monto);
    if (fecha !== undefined) bill.fecha = parseOptionalDate(fecha) || bill.fecha;
    if (facturaUrl !== undefined) bill.facturaUrl = String(facturaUrl || '').trim();
    if (notas !== undefined) bill.notas = String(notas || '').trim();

    await bill.save();
    const populated = await Bill.findById(bill._id)
        .populate('registradoPor', 'nombre apellido')
        .lean();
    res.json(populated);
});

const payBill = asyncHandler(async (req, res) => {
    const { Bill } = req.models;
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
        res.status(404);
        throw new Error('Factura no encontrada.');
    }
    if (bill.estado === 'pagado') {
        res.status(400);
        throw new Error('Esta factura ya está pagada.');
    }

    const { metodoPago, fechaPago, pagoComprobanteUrl, notas } = req.body || {};
    bill.estado = 'pagado';
    bill.metodoPago = parseMetodo(metodoPago || 'transferencia', BILL_METODOS);
    bill.fechaPago = parseOptionalDate(fechaPago) || new Date();
    if (pagoComprobanteUrl !== undefined) {
        bill.pagoComprobanteUrl = String(pagoComprobanteUrl || '').trim();
    }
    if (notas !== undefined) bill.notas = String(notas || '').trim();

    await bill.save();
    const populated = await Bill.findById(bill._id)
        .populate('registradoPor', 'nombre apellido')
        .lean();
    res.json(populated);
});

const deleteBill = asyncHandler(async (req, res) => {
    const { Bill } = req.models;
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) {
        res.status(404);
        throw new Error('Factura no encontrada.');
    }
    res.json({ message: 'Factura eliminada.', id: bill._id });
});

export {
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
};
