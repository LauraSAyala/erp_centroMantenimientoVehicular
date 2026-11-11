import { Router } from 'express';
import * as c from '../controllers/vehiculos.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});

router.use(requireAuth, requireRole('lider_area', 'administrador'));

router.get('/', c.listar);
router.get('/placa/:placa', c.porPlaca);
router.post('/', c.crear);
router.put('/:id', c.editar);

export default router;