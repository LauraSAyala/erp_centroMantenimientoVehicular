import { Router } from 'express';
import * as c from '../controllers/usuarios.controller.js';
import { requireAuth, requireRole, requireSede } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth);

// Accesible al líder (su sede) y al administrador
router.get('/mecanicos', requireRole('administrador', 'lider_area'), requireSede, c.mecanicos);

// Solo administrador
router.use(requireRole('administrador'));
router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});
router.get('/', c.listar);
router.post('/', c.crear);
router.get('/:id', c.obtener);
router.put('/:id', c.editar);
router.patch('/:id/estado', c.cambiarEstado);
router.post('/:id/restablecer-password', c.restablecerPassword);

export default router;