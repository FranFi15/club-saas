import mongoose from 'mongoose';

const seccionEstadioSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        filas: { type: Number, required: true, min: 1, max: 40 },
        asientosPorFila: { type: Number, required: true, min: 1, max: 80 },
        x: { type: Number, default: 0, min: 0, max: 100 },
        y: { type: Number, default: 0, min: 0, max: 100 },
        w: { type: Number, default: 0, min: 0, max: 100 },
        h: { type: Number, default: 0, min: 0, max: 100 },
    },
    { _id: true },
);

const clubStadiumSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        mapaUrl: { type: String, trim: true, default: '' },
        secciones: [seccionEstadioSchema],
    },
    { timestamps: true },
);

export const getClubStadiumModel = (tenantDB) =>
    tenantDB.models.ClubStadium || tenantDB.model('ClubStadium', clubStadiumSchema);
