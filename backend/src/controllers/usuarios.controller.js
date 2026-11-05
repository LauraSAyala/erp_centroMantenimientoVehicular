import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

const ROLES = ['administrador', 'lider_area', 'mecanico', 'cajero'];

const usuarioBase = z.object({
  nombre: z.string().trim().min(1, 'Obligatorio').max(80),
  apellido: z.string().trim().min(1, 'Obligatorio').max(80),
  identificacion: z.string().trim().min(1, 'Obligatoria').max(20),
  email: z.email('Correo inválido').max(120),
  telefono: z.string().trim().max(20).optional().nullable(),
  rol: z.enum(ROLES),
  id_sede: z.coerce.number().int().positive().optional().nullable(),
});

// Líder, mecánico y cajero siempre llevan sede (la BD también lo exige)
function exigirSede(d, ctx) {
  if (d.rol !== 'administrador' && !d.id_sede) {
    ctx.addIssue({ code: 'custom', path: ['id_sede'], message: 'La sede es obligatoria para este rol' });
  }
}

const crearSchema = usuarioBase
  .extend({ password: z.string().min(8, 'Mínimo 8 caracteres') })
  .superRefine(exigirSede);

const editarSchema = usuarioBase.superRefine(exigirSede);

const resetSchema = z.object({ password: z.string().min(8, 'Mínimo 8 caracteres') });

const select = {
  id_usuario: true,
  nombre: true,
  apellido: true,
  identificacion: true,
  email: true,
  telefono: true,
  rol: true,
  id_sede: true,
  activo: true,
  debe_cambiar_password: true,
  fecha_creacion: true,
  sede: { select: { id_sede: true, ciudad: true, direccion: true } },
};

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

// Convierte el error de campo único de Prisma (P2002) en un mensaje claro
function duplicado(res, e) {
  if (e.code === 'P2002') {
    const campo = e.meta?.target?.includes('email') ? 'correo' : 'identificación';
    return res.status(409).json({ ok: false, mensaje: `Ya existe un usuario con ese ${campo}` });
  }
  throw e;
}

export async function listar(req, res) {
  const { rol, id_sede, activo } = req.query;
  const where = {};
  if (rol) where.rol = rol;
  if (id_sede) where.id_sede = Number(id_sede);
  if (activo !== undefined) where.activo = activo === 'true';

  const usuarios = await prisma.usuario.findMany({
    where,
    select,
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
  });
  res.json({ ok: true, usuarios });
}

export async function obtener(req, res) {
  const usuario = await prisma.usuario.findUnique({
    where: { id_usuario: Number(req.params.id) },
    select,
  });
  if (!usuario) return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
  res.json({ ok: true, usuario });
}

export async function crear(req, res) {
  const datos = crearSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const { password, ...resto } = datos.data;
  if (resto.rol === 'administrador') resto.id_sede = null;

  const sede = resto.id_sede
    ? await prisma.sede.findUnique({ where: { id_sede: resto.id_sede } })
    : null;
  if (resto.id_sede && (!sede || !sede.activo)) {
    return res.status(400).json({ ok: false, mensaje: 'La sede no existe o está inactiva' });
  }

  try {
    const usuario = await prisma.usuario.create({
      data: {
        ...resto,
        password_hash: await bcrypt.hash(password, 12),
        debe_cambiar_password: true,
      },
      select,
    });
    res.status(201).json({ ok: true, usuario });
  } catch (e) {
    return duplicado(res, e);
  }
}

export async function editar(req, res) {
  const id = Number(req.params.id);
  const datos = editarSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const resto = datos.data;
  if (resto.rol === 'administrador') resto.id_sede = null;

  // Un administrador no puede quitarse su propio rol (evita quedarse sin admins)
  if (id === req.user.id_usuario && resto.rol !== 'administrador') {
    return res.status(400).json({ ok: false, mensaje: 'No puedes cambiar tu propio rol' });
  }

  try {
    const usuario = await prisma.usuario.update({ where: { id_usuario: id }, data: resto, select });
    res.json({ ok: true, usuario });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    return duplicado(res, e);
  }
}

export async function cambiarEstado(req, res) {
  const id = Number(req.params.id);
  const activo = req.body?.activo;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, mensaje: 'Debes enviar activo: true o false' });
  }
  if (id === req.user.id_usuario && !activo) {
    return res.status(400).json({ ok: false, mensaje: 'No puedes desactivar tu propia cuenta' });
  }

  try {
    const usuario = await prisma.usuario.update({ where: { id_usuario: id }, data: { activo }, select });
    res.json({ ok: true, usuario });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    throw e;
  }
}

// Restablece la contraseña: el usuario deberá cambiarla en su próximo ingreso
export async function restablecerPassword(req, res) {
  const datos = resetSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  try {
    await prisma.usuario.update({
      where: { id_usuario: Number(req.params.id) },
      data: { password_hash: await bcrypt.hash(datos.data.password, 12), debe_cambiar_password: true },
    });
    res.json({ ok: true, mensaje: 'Contraseña restablecida' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    throw e;
  }
}

// Para Dev B: mecánicos activos de la sede del usuario (líder) o de ?id_sede= (admin)
export async function mecanicos(req, res) {
  const where = { rol: 'mecanico', activo: true };
  if (req.sedeId) where.id_sede = req.sedeId;

  const mecanicos = await prisma.usuario.findMany({
    where,
    select: { id_usuario: true, nombre: true, apellido: true, id_sede: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ ok: true, mecanicos });
}