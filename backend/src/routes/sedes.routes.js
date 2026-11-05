import { Router } from 'express';
import * as c from '../controllers/sedes.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});

router.use(requireAuth);

// Listar sedes: lo necesita el administrador (formularios de usuarios, reportes, inventario)
router.use(requireRole('administrador'));
router.get('/', c.listar);
router.post('/', c.crear);
router.get('/:id', c.obtener);
router.put('/:id', c.editar);
router.patch('/:id/estado', c.cambiarEstado);

export default router;