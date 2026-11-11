import { z } from 'zod';
import { prisma } from '../db.js';

const clienteSchema = z.object({
  identificacion: z.string().trim().min(1, 'Obligatoria').max(20),
  nombre: z.string().trim().min(1, 'Obligatorio').max(80),
  apellido: z.string().trim().min(1, 'Obligatorio').max(80),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.email('Correo inválido').max(120).optional().nullable().or(z.literal('')),
});

const select = {
  id_cliente: true,
  identificacion: true,
  nombre: true,
  apellido: true,
  telefono: true,
  email: true,
  fecha_creacion: true,
  vehiculo: {
    select: { id_vehiculo: true, placa: true, tipo_vehiculo: true, kilometraje: true },
  },
};

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

function limpiar(d) {
  return { ...d, email: d.email || null, telefono: d.telefono || null };
}

// ?q= busca por nombre, apellido o identificación (máximo 50 resultados)
export async function listar(req, res) {
  const q = String(req.query.q ?? '').trim();
  const where = q
    ? {
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          { apellido: { contains: q, mode: 'insensitive' } },
          { identificacion: { contains: q } },
        ],
      }
    : {};

  const clientes = await prisma.cliente.findMany({
    where,
    select,
    orderBy: { nombre: 'asc' },
    take: 50,
  });
  res.json({ ok: true, clientes });
}

export async function obtener(req, res) {
  const cliente = await prisma.cliente.findUnique({
    where: { id_cliente: Number(req.params.id) },
    select,
  });
  if (!cliente) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
  res.json({ ok: true, cliente });
}

export async function crear(req, res) {
  const datos = clienteSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  try {
    const cliente = await prisma.cliente.create({ data: limpiar(datos.data), select });
    res.status(201).json({ ok: true, cliente });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un cliente con esa identificación' });
    }
    throw e;
  }
}

export async function editar(req, res) {
  const datos = clienteSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  try {
    const cliente = await prisma.cliente.update({
      where: { id_cliente: Number(req.params.id) },
      data: limpiar(datos.data),
      select,
    });
    res.json({ ok: true, cliente });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un cliente con esa identificación' });
    }
    throw e;
  }
}