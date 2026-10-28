import { Router } from 'express';
import { estadoSistema } from '../controllers/salud.controller.js';

const router = Router();
router.get('/', estadoSistema);

export default router;