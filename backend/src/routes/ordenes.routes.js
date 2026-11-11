import { Router } from 'express';
import * as c from '../controllers/ordenes.controller.js';
import { requireAuth, requireRole, requireSede } from '../middlewares/auth.js';

const router = Router();

router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});

router.use(requireAuth, requireSede);

// Panel de la sede: líder y mecánico
router.get('/panel', requireRole('lider_area', 'mecanico'), c.panel);

// Líder
router.post('/', requireRole('lider_area'), c.crear);
router.put('/:id', requireRole('lider_area'), c.editar);
router.post('/:id/anular', requireRole('lider_area'), c.anular);

// Mecánico
router.post('/:id/iniciar', requireRole('mecanico'), c.iniciar);
router.post('/:id/finalizar', requireRole('mecanico'), c.finalizar);

// Consulta
router.get('/', requireRole('lider_area', 'administrador'), c.listar);
router.get('/:id', requireRole('lider_area', 'mecanico', 'administrador'), c.obtener);

export default router;