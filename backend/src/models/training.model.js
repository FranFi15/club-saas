import mongoose from 'mongoose';

const trainingPlanSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Ej: "Práctica Jueves - Pre Partido"
    disciplina: { type: mongoose.Schema.Types.ObjectId, ref: 'Discipline' },
    
    bloques: [{
        // El profe puede ponerle un nombre libre si quiere, o dejarlo genérico
        tituloBloque: { type: String, required: true }, // Ej: "Partido condicionado"
        
        // TU IDEA: El formato numérico o espacial
        formato: { type: String, required: true }, // Ej: "5vs5", "3vs2", "11vs11", "Individual", "Ruedas"
        
        // TU IDEA: El enfoque táctico/físico
        enfoque: { 
            type: String, 
            enum: ['ofensivo', 'defensivo', 'transicion_ataque', 'transicion_defensa', 'fisico', 'tecnico', 'neutro'], 
            required: true 
        },
        
        duracionMinutos: { type: Number, required: true },
        descripcionDetallada: { type: String } // Por si quiere anotar reglas ("A 2 toques")
    }],
    
    objetivoSesion: { type: String },
    creador: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const getTrainingPlanModel = (tenantDB) => tenantDB.models.TrainingPlan || tenantDB.model('TrainingPlan', trainingPlanSchema);