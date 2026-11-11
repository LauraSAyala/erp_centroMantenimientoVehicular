import { z } from 'zod';
import { prisma } from '../db.js';

const productoSchema = z.object({
  nombre_producto: z.string().trim().min(1, 'Obligatorio').max(120),
  descripcion: z.string().trim().max(255).optional().nullable(),
  stock: z.coerce.number().min(0, 'No puede ser negativo').max(99999999),
  precio_unitario: z.coerce.number().min(0, 'No puede ser negativo').max(9999999999),
  id_sede: z.coerce.number().int().positive().optional(),
});

const entradaSchema = z.object({
  cantidad: z.coerce.number().positive('Debe ser mayor a 0').max(99999999),
  nota: z.string().trim().max(255).optional().nullable(),
});

const select = {
  id_producto: true,
  id_sede: true,
  nombre_producto: true,
  descripcion: true,
  stock: true,
  precio_unitario: true,
  activo: true,
  sede: { select: { id_sede: true, ciudad: true, direccion: true } },
};

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

// Busca un producto y verifica que pertenezca a la sede permitida (RNF-10)
async function productoPermitido(req, id) {
  const p = await prisma.producto.findUnique({ where: { id_producto: id }, select });
  if (!p) return null;
  if (req.sedeId && p.id_sede !== req.sedeId) return null;
  return p;
}

// Administrador: todos (filtra con ?id_sede=). Líder: solo activos de su sede.
export async function listar(req, res) {
  const where = {};
  if (req.sedeId) where.id_sede = req.sedeId;

  if (req.user.rol === 'lider_area') where.activo = true;
  else if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';

  const q = String(req.query.q ?? '').trim();
  if (q) where.nombre_producto = { contains: q, mode: 'insensitive' };

  const productos = await prisma.producto.findMany({
    where,
    select,
    orderBy: [{ activo: 'desc' }, { nombre_producto: 'asc' }],
  });
  res.json({ ok: true, productos });
}

export async function obtener(req, res) {
  const p = await productoPermitido(req, Number(req.params.id));
  if (!p) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
  res.json({ ok: true, producto: p });
}

export async function crear(req, res) {
  const datos = productoSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const idSede = datos.data.id_sede ?? req.sedeId;
  if (!idSede) return res.status(400).json({ ok: false, mensaje: 'Debes elegir una sede' });

  const sede = await prisma.sede.findUnique({ where: { id_sede: idSede } });
  if (!sede || !sede.activo) {
    return res.status(400).json({ ok: false, mensaje: 'La sede no existe o está inactiva' });
  }

  try {
    const producto = await prisma.$transaction(async (tx) => {
      const { stock, ...resto } = datos.data;
      const nuevo = await tx.producto.create({
        data: { ...resto, id_sede: idSede, stock },
        select,
      });
      // El stock inicial queda registrado como una entrada
      if (stock > 0) {
        await tx.movimiento_inventario.create({
          data: {
            id_producto: nuevo.id_producto,
            tipo: 'entrada',
            cantidad: stock,
            id_usuario: req.user.id_usuario,
            nota: 'Stock inicial',
          },
        });
      }
      return nuevo;
    });
    res.status(201).json({ ok: true, producto });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un producto con ese nombre en la sede' });
    }
    throw e;
  }
}

// Edita nombre, descripción y precio. El stock solo cambia con entradas u órdenes.
export async function editar(req, res) {
  const datos = productoSchema
    .pick({ nombre_producto: true, descripcion: true, precio_unitario: true })
    .safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const existente = await productoPermitido(req, Number(req.params.id));
  if (!existente) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });

  try {
    const producto = await prisma.producto.update({
      where: { id_producto: existente.id_producto },
      data: datos.data,
      select,
    });
    res.json({ ok: true, producto });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un producto con ese nombre en la sede' });
    }
    throw e;
  }
}

export async function cambiarEstado(req, res) {
  const activo = req.body?.activo;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, mensaje: 'Debes enviar activo: true o false' });
  }
  const existente = await productoPermitido(req, Number(req.params.id));
  if (!existente) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });

  const producto = await prisma.producto.update({
    where: { id_producto: existente.id_producto },
    data: { activo },
    select,
  });
  res.json({ ok: true, producto });
}

// Entrada de existencias: suma stock y registra el movimiento
export async function registrarEntrada(req, res) {
  const datos = entradaSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  const existente = await productoPermitido(req, Number(req.params.id));
  if (!existente) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });

  const producto = await prisma.$transaction(async (tx) => {
    const actualizado = await tx.producto.update({
      where: { id_producto: existente.id_producto },
      data: { stock: { increment: datos.data.cantidad } },
      select,
    });
    await tx.movimiento_inventario.create({
      data: {
        id_producto: existente.id_producto,
        tipo: 'entrada',
        cantidad: datos.data.cantidad,
        id_usuario: req.user.id_usuario,
        nota: datos.data.nota || null,
      },
    });
    return actualizado;
  });
  res.json({ ok: true, producto });
}

// Historial de movimientos de un producto
export async function movimientos(req, res) {
  const existente = await productoPermitido(req, Number(req.params.id));
  if (!existente) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });

  const movimientos = await prisma.movimiento_inventario.findMany({
    where: { id_producto: existente.id_producto },
    orderBy: { fecha: 'desc' },
    take: 100,
    select: {
      id_movimiento: true,
      tipo: true,
      cantidad: true,
      fecha: true,
      nota: true,
      id_orden_servicio: true,
      usuario: { select: { nombre: true, apellido: true } },
    },
  });
  res.json({ ok: true, movimientos });
}