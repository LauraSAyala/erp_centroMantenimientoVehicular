import { z } from 'zod';
import { prisma } from '../db.js';

// Normaliza la placa: mayúsculas y sin espacios ni guiones
export function normalizarPlaca(placa) {
  return String(placa ?? '').toUpperCase().replace(/[\s-]/g, '');
}

const vehiculoSchema = z.object({
  placa: z
    .string()
    .transform(normalizarPlaca)
    .pipe(z.string().regex(/^[A-Z0-9]{5,8}$/, 'Placa inválida')),
  tipo_vehiculo: z.enum(['carro', 'moto', 'camion']),
  kilometraje: z.coerce.number().min(0, 'No puede ser negativo').max(99999999),
  id_cliente: z.coerce.number().int().positive('Cliente obligatorio'),
});

const select = {
  id_vehiculo: true,
  placa: true,
  tipo_vehiculo: true,
  kilometraje: true,
  id_cliente: true,
  cliente: {
    select: {
      id_cliente: true,
      identificacion: true,
      nombre: true,
      apellido: true,
      telefono: true,
      email: true,
    },
  },
};

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

// ?q= busca por placa
export async function listar(req, res) {
  const q = normalizarPlaca(req.query.q);
  const vehiculos = await prisma.vehiculo.findMany({
    where: q ? { placa: { contains: q } } : {},
    select,
    orderBy: { placa: 'asc' },
    take: 50,
  });
  res.json({ ok: true, vehiculos });
}

// Autocompletado: al escribir una placa, devuelve vehículo + cliente asociado
export async function porPlaca(req, res) {
  const placa = normalizarPlaca(req.params.placa);
  const vehiculo = await prisma.vehiculo.findUnique({ where: { placa }, select });
  if (!vehiculo) return res.status(404).json({ ok: false, mensaje: 'Placa no registrada' });
  res.json({ ok: true, vehiculo });
}

export async function crear(req, res) {
  const datos = vehiculoSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const cliente = await prisma.cliente.findUnique({ where: { id_cliente: datos.data.id_cliente } });
  if (!cliente) return res.status(400).json({ ok: false, mensaje: 'El cliente no existe' });

  try {
    const vehiculo = await prisma.vehiculo.create({ data: datos.data, select });
    res.status(201).json({ ok: true, vehiculo });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un vehículo con esa placa' });
    }
    throw e;
  }
}

// Permite actualizar kilometraje, tipo o reasignar el vehículo a otro cliente
export async function editar(req, res) {
  const datos = vehiculoSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const cliente = await prisma.cliente.findUnique({ where: { id_cliente: datos.data.id_cliente } });
  if (!cliente) return res.status(400).json({ ok: false, mensaje: 'El cliente no existe' });

  try {
    const vehiculo = await prisma.vehiculo.update({
      where: { id_vehiculo: Number(req.params.id) },
      data: datos.data,
      select,
    });
    res.json({ ok: true, vehiculo });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ ok: false, mensaje: 'Vehículo no encontrado' });
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un vehículo con esa placa' });
    }
    throw e;
  }
}