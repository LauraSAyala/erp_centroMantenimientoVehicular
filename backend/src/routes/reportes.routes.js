import { Router } from 'express';
import * as c from '../controllers/reportes.controller.js';
import { requireAuth, requireRole, requireSede } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth, requireRole('administrador'), requireSede);

router.get('/cumplimiento', c.cumplimiento);
router.get('/exportar', c.exportar);

export default router;