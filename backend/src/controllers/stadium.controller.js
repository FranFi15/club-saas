import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

function normalizeSections(raw) {
    return (Array.isArray(raw) ? raw : [])
        .map((section) => ({
            ...(section?._id && mongoose.Types.ObjectId.isValid(String(section._id))
                ? { _id: section._id }
                : {}),
            nombre: String(section?.nombre || '').trim() || 'Sector',
            filas: Math.max(1, Math.min(40, Math.floor(Number(section?.filas) || 1))),
            asientosPorFila: Math.max(1, Math.min(80, Math.floor(Number(section?.asientosPorFila) || 1))),
            x: Math.max(0, Math.min(100, Number(section?.x) || 0)),
            y: Math.max(0, Math.min(100, Number(section?.y) || 0)),
            w: Math.max(0, Math.min(100, Number(section?.w) || 0)),
            h: Math.max(0, Math.min(100, Number(section?.h) || 0)),
        }))
        .filter((section) => section.nombre);
}

export const listStadiums = asyncHandler(async (req, res) => {
    const stadiums = await req.models.Stadium.find().sort({ nombre: 1 }).lean();
    res.json(stadiums);
});

export const createStadium = asyncHandler(async (req, res) => {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
        res.status(400);
        throw new Error('El estadio necesita un nombre.');
    }
    const stadium = await req.models.Stadium.create({
        nombre,
        mapaUrl: String(req.body?.mapaUrl || '').trim(),
        secciones: normalizeSections(req.body?.secciones),
    });
    res.status(201).json(stadium);
});

export const updateStadium = asyncHandler(async (req, res) => {
    const stadium = await req.models.Stadium.findById(req.params.id);
    if (!stadium) {
        res.status(404);
        throw new Error('Estadio no encontrado.');
    }
    if (req.body?.nombre != null) {
        const nombre = String(req.body.nombre).trim();
        if (!nombre) {
            res.status(400);
            throw new Error('El estadio necesita un nombre.');
        }
        stadium.nombre = nombre;
    }
    if (req.body?.mapaUrl != null) stadium.mapaUrl = String(req.body.mapaUrl).trim();
    if (req.body?.secciones != null) stadium.secciones = normalizeSections(req.body.secciones);
    await stadium.save();
    res.json(stadium);
});

export const deleteStadium = asyncHandler(async (req, res) => {
    const stadium = await req.models.Stadium.findByIdAndDelete(req.params.id);
    if (!stadium) {
        res.status(404);
        throw new Error('Estadio no encontrado.');
    }
    res.json({ ok: true });
});
