import { z } from 'zod';
import { prisma } from '../db.js';

const sedeSchema = z.object({
  ciudad: z.string().trim().min(1, 'Obligatoria').max(80),
  direccion: z.string().trim().min(1, 'Obligatoria').max(150),
  telefono: z.string().trim().max(20).optional().nullable(),
});

// _count.usuario = usuarios ACTIVOS de la sede
const select = {
  id_sede: true,
  ciudad: true,
  direccion: true,
  telefono: true,
  activo: true,
  _count: { select: { usuario: { where: { activo: true } } } },
};

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

export async function listar(req, res) {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const sedes = await prisma.sede.findMany({
    where,
    select,
    orderBy: [{ activo: 'desc' }, { ciudad: 'asc' }, { direccion: 'asc' }],
  });
  res.json({ ok: true, sedes });
}

export async function obtener(req, res) {
  const sede = await prisma.sede.findUnique({
    where: { id_sede: Number(req.params.id) },
    select,
  });
  if (!sede) return res.status(404).json({ ok: false, mensaje: 'Sede no encontrada' });
  res.json({ ok: true, sede });
}

export async function crear(req, res) {
  const datos = sedeSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const sede = await prisma.sede.create({ data: datos.data, select });
  res.status(201).json({ ok: true, sede });
}

export async function editar(req, res) {
  const datos = sedeSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  try {
    const sede = await prisma.sede.update({
      where: { id_sede: Number(req.params.id) },
      data: datos.data,
      select,
    });
    res.json({ ok: true, sede });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Sede no encontrada' });
    throw e;
  }
}

export async function cambiarEstado(req, res) {
  const id = Number(req.params.id);
  const activo = req.body?.activo;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, mensaje: 'Debes enviar activo: true o false' });
  }

  // No se puede desactivar una sede que aún tiene usuarios activos
  if (!activo) {
    const usuariosActivos = await prisma.usuario.count({ where: { id_sede: id, activo: true } });
    if (usuariosActivos > 0) {
      return res.status(409).json({
        ok: false,
        mensaje: `La sede tiene ${usuariosActivos} usuario(s) activo(s). Reasígnalos o desactívalos primero.`,
      });
    }
  }

  try {
    const sede = await prisma.sede.update({ where: { id_sede: id }, data: { activo }, select });
    res.json({ ok: true, sede });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Sede no encontrada' });
    throw e;
  }
}