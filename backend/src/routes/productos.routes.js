import { Router } from 'express';
import * as c from '../controllers/productos.controller.js';
import { requireAuth, requireRole, requireSede } from '../middlewares/auth.js';

const router = Router();

router.param('id', (req, res, next, valor) => {
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ ok: false, mensaje: 'Id inválido' });
  }
  next();
});

router.use(requireAuth);

// Líder (RF-12): consulta de productos activos de su sede. Administrador: todos.
router.get('/', requireRole('administrador', 'lider_area'), requireSede, c.listar);

// Solo administrador
router.use(requireRole('administrador'), requireSede);
router.post('/', c.crear);
router.get('/:id', c.obtener);
router.put('/:id', c.editar);
router.patch('/:id/estado', c.cambiarEstado);
router.post('/:id/entradas', c.registrarEntrada);
router.get('/:id/movimientos', c.movimientos);

export default router;