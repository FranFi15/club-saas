import { getUserModel } from '../models/user.model.js';
import { getDisciplineModel } from '../models/discipline.model.js';
import { getCategoryModel } from '../models/category.model.js';
import { getScheduleModel } from '../models/schedule.model.js';
import { getEnrollmentModel } from '../models/enrollment.model.js';
import { getSessionModel } from '../models/session.model.js'; 
import { getSpaceModel } from '../models/space.model.js';
import { getPlanModel, getPaymentModel } from '../models/financial.model.js';
import {getRentalModel} from '../models/rental.model.js';
import { getNewsModel } from '../models/news.model.js';
import { getResourceModel } from '../models/resource.model.js';
import {getRequirementModel, getSubmissionModel} from '../models/requirement.model.js';
import {getMetricDefModel, getMeasurementModel, getClinicalNoteModel} from '../models/performance.model.js';
import {getInjuryModel, getMedicalAppointmentModel} from '../models/medical.model.js';
import {getTrainingPlanModel} from '../models/training.model.js';
import {getWellnessModel} from '../models/wellness.model.js';
import {getNotificationModel} from '../models/notification.model.js';
import { getClubSettingsModel } from '../models/clubSettings.model.js';
import { getSwapRequestModel } from '../models/swapRequest.model.js';
import { getEnrollmentRequestModel } from '../models/enrollmentRequest.model.js';
import { getClubEntryModel } from '../models/clubEntry.model.js';
import { getChatConversationModel } from '../models/chatConversation.model.js';
import { getChatMessageModel } from '../models/chatMessage.model.js';
import { getMpProcessedPaymentModel } from '../models/mpProcessedPayment.model.js';

export const getTenantModels = (tenantDB) => {
    // Al llamar a todas estas funciones acá, Mongoose registra TODOS los esquemas 
    // en esta base de datos particular de una sola vez.
    return {
        User: getUserModel(tenantDB),
        Discipline: getDisciplineModel(tenantDB),
        Category: getCategoryModel(tenantDB),
        Schedule: getScheduleModel(tenantDB),
        Enrollment: getEnrollmentModel(tenantDB),
        Session: getSessionModel(tenantDB),
        Space: getSpaceModel(tenantDB),
        Plan: getPlanModel(tenantDB),
        Payment: getPaymentModel(tenantDB),
        Rental: getRentalModel(tenantDB),
        News: getNewsModel(tenantDB),
        Resource: getResourceModel(tenantDB),
        Requirement: getRequirementModel(tenantDB),
        Submission: getSubmissionModel(tenantDB),
        MetricDefinition: getMetricDefModel(tenantDB),
        Measurement: getMeasurementModel(tenantDB),
        ClinicalNote: getClinicalNoteModel(tenantDB),
        Injury: getInjuryModel(tenantDB),
        MedicalAppointment: getMedicalAppointmentModel(tenantDB),
        TrainingPlan: getTrainingPlanModel(tenantDB),
        Wellness: getWellnessModel(tenantDB),
        Notification: getNotificationModel(tenantDB),
        ClubSettings: getClubSettingsModel(tenantDB),
        SwapRequest: getSwapRequestModel(tenantDB),
        EnrollmentRequest: getEnrollmentRequestModel(tenantDB),
        ClubEntry: getClubEntryModel(tenantDB),
        ChatConversation: getChatConversationModel(tenantDB),
        ChatMessage: getChatMessageModel(tenantDB),
        MpProcessedPayment: getMpProcessedPaymentModel(tenantDB),
    };
};
