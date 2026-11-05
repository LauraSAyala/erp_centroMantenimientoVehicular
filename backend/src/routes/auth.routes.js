import { Router } from 'express';
import { login, logout, me, cambiarPassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/cambiar-password', requireAuth, cambiarPassword);

export default router;