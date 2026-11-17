import { Router } from 'express';
import * as c from '../controllers/cobros.controller.js';
import { requireAuth, requireRole, requireSede } from '../middlewares/auth.js';

const router = Router();

router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});

router.use(requireAuth, requireRole('cajero'), requireSede);

router.get('/', c.listar);
router.post('/:id/cerrar', c.cerrar);

export default router;