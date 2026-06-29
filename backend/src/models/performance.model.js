import mongoose from 'mongoose';

// 1. DEFINICIÓN DE MÉTRICA (Lo que crea el PF o Nutricionista una sola vez)
const metricDefinitionSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Ej: "Salto Vertical", "Grasa Corporal"
    unidad: { type: String, required: true }, // Ej: "cm", "kg", "%", "segundos"
    
    // TU IDEA BRILLANTE: Para que el frontend sepa cómo dibujar el gráfico (verde hacia arriba o verde hacia abajo)
    mejorDireccion: { 
        type: String, 
        enum: ['mayor_es_mejor', 'menor_es_mejor'], 
        required: true 
    },
    
    area: {
        type: String,
        enum: [
            'fisico',
            'nutricion',
            'medico',
            'pliegues_cutaneos',
            'metodologia_isak',
            'diametros_oseos',
            'datos_basicos',
            'perimetros',
        ],
        required: true,
    },
    creador: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });


// 2. EL REGISTRO DE LA MÉTRICA (El número que se anota cada mes)
const measurementSchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metrica: { type: mongoose.Schema.Types.ObjectId, ref: 'MetricDefinition', required: true },
    evaluador: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Quien lo midió
    
    valor: { type: Number, required: true },
    fechaMedicion: { type: Date, default: Date.now },
    notasExtra: { type: String }, // "Estaba cansado por el partido de ayer"
    
    // PERMISOS DE VISIBILIDAD (Tu otra gran idea)
    visibleParaAtleta: { type: Boolean, default: true },
    visibleParaTutor: { type: Boolean, default: true }
}, { timestamps: true });


// 3. LA NOTA CLÍNICA / EVOLUTIVA (El "Word" del Psicólogo o Médico)
const clinicalNoteSchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // El psicólogo
    area: { type: String, enum: ['psicologia', 'medicina', 'kinesiologia'], required: true },
    
    titulo: { type: String, required: true },
    // Acá en el frontend vas a enchufar un editor como Quill.js o TinyMCE que escupe HTML
    contenidoRichText: { type: String, required: true }, 
    fecha: { type: Date, default: Date.now },
    
    // PERMISOS DE VISIBILIDAD MÁS ESTRICTOS (Por defecto oculto para el pibe y el padre)
    visibleParaAtleta: { type: Boolean, default: false },
    visibleParaTutor: { type: Boolean, default: false }
}, { timestamps: true });

export const getMetricDefModel = (tenantDB) => tenantDB.models.MetricDefinition || tenantDB.model('MetricDefinition', metricDefinitionSchema);
export const getMeasurementModel = (tenantDB) => tenantDB.models.Measurement || tenantDB.model('Measurement', measurementSchema);
export const getClinicalNoteModel = (tenantDB) => tenantDB.models.ClinicalNote || tenantDB.model('ClinicalNote', clinicalNoteSchema);