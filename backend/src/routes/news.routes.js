import express from 'express';
import { createNews, getMyNewsFeed, getAllNews, updateNews, deleteNews } from '../controllers/news.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/feed', protect, getMyNewsFeed);
router.get('/', protect, authorize('admin_club', 'administrativo', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), getAllNews);
router.post('/', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), createNews);
router.put('/:id', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), updateNews);
router.delete('/:id', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), deleteNews);

export default router;