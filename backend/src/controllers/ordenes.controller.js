import { z } from 'zod';
import { prisma } from '../db.js';
import { descontarStock, devolverStock } from '../services/stock.js';
import { ReglaError } from '../services/reglas.js';

const UMBRAL_SEG = 300; // 5 minutos (RF-06)

// La transacción interactiva de Prisma dura 5 s por defecto; con la latencia
// de Supabase en desarrollo hay que ampliarla.
const TX = { maxWait: 10000, timeout: 30000 };

const select = {
  id_orden_servicio: true,
  id_sede: true,
  descripcion: true,
  kilometraje_ingreso: true,
  tiempo_asignado_min: true,
  fecha_creacion: true,
  hora_inicio: true,
  hora_fin: true,
  tiempo_real_min: true,
  estado: true,
  motivo_anulacion: true,
  vehiculo: { select: { id_vehiculo: true, placa: true, tipo_vehiculo: true } },
  cliente: { select: { id_cliente: true, nombre: true, apellido: true, identificacion: true } },
  usuario_orden_servicio_id_mecanicoTousuario: {
    select: { id_usuario: true, nombre: true, apellido: true },
  },
  detalle_orden_producto: {
    select: {
      cantidad: true,
      precio_unitario: true,
      producto: { select: { id_producto: true, nombre_producto: true } },
    },
  },
};

// Calcula el tiempo restante con la hora del servidor
function tiempos(o, ahora) {
  const asignadoSeg = o.tiempo_asignado_min * 60;
  if (o.estado !== 'en_proceso' || !o.hora_inicio) {
    return { tiempo_restante_seg: asignadoSeg, estado_tiempo: 'sin_iniciar' };
  }
  const transcurrido = Math.floor((ahora.getTime() - o.hora_inicio.getTime()) / 1000);
  const restante = asignadoSeg - transcurrido;
  const estado_tiempo =
    restante <= 0 ? 'retrasada' : restante <= UMBRAL_SEG ? 'por_vencer' : 'a_tiempo';
  return { tiempo_restante_seg: restante, estado_tiempo };
}

// Da nombres cortos a la relación del mecánico y agrega los tiempos
function formatear(o, ahora) {
  const { usuario_orden_servicio_id_mecanicoTousuario: mecanico, ...resto } = o;
  return { ...resto, mecanico, ...tiempos(o, ahora) };
}

function invalido(res, error) {
  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errores: z.flattenError(error).fieldErrors,
  });
}

const crearSchema = z
  .object({
    id_vehiculo: z.coerce.number().int().positive('Vehículo obligatorio'),
    id_mecanico: z.coerce.number().int().positive('Mecánico obligatorio'),
    descripcion: z.string().trim().min(1, 'Obligatoria').max(2000),
    kilometraje_ingreso: z.coerce.number().min(0, 'No puede ser negativo').max(99999999),
    tiempo_asignado_min: z.coerce.number().int().min(1, 'Mínimo 1 minuto').max(1440),
    productos: z
      .array(
        z.object({
          id_producto: z.coerce.number().int().positive(),
          cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').max(99999999),
        })
      )
      .default([]),
  })
  .superRefine((d, ctx) => {
    const ids = d.productos.map((p) => p.id_producto);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['productos'], message: 'Hay productos repetidos' });
    }
  });

const editarSchema = z.object({
  id_mecanico: z.coerce.number().int().positive('Mecánico obligatorio'),
  descripcion: z.string().trim().min(1, 'Obligatoria').max(2000),
  tiempo_asignado_min: z.coerce.number().int().min(1, 'Mínimo 1 minuto').max(1440),
});

const anularSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica el motivo').max(255),
});

// Verifica que el mecánico sea activo y de la sede
async function validarMecanico(idMecanico, idSede) {
  const m = await prisma.usuario.findFirst({
    where: { id_usuario: idMecanico, rol: 'mecanico', activo: true, id_sede: idSede },
    select: { id_usuario: true },
  });
  if (!m) throw new ReglaError('El mecánico no existe, está inactivo o es de otra sede', 400);
}

// RF-05: crear orden (líder). Nace "pendiente" y descuenta el stock.
export async function crear(req, res) {
  const datos = crearSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);
  const d = datos.data;
  const idSede = req.sedeId;
  const ids = d.productos.map((p) => p.id_producto);

  const [vehiculo, productos] = await Promise.all([
    prisma.vehiculo.findUnique({ where: { id_vehiculo: d.id_vehiculo } }),
    ids.length
      ? prisma.producto.findMany({ where: { id_producto: { in: ids }, id_sede: idSede, activo: true } })
      : [],
    validarMecanico(d.id_mecanico, idSede),
  ]);
  if (!vehiculo) throw new ReglaError('El vehículo no existe', 400);
  if (productos.length !== ids.length) {
    throw new ReglaError('Algún producto no existe, está inactivo o es de otra sede', 400);
  }
  const precios = new Map(productos.map((p) => [p.id_producto, p.precio_unitario]));

  const orden = await prisma.$transaction(async (tx) => {
    const nueva = await tx.orden_servicio.create({
      data: {
        id_sede: idSede,
        id_cliente: vehiculo.id_cliente,
        id_vehiculo: vehiculo.id_vehiculo,
        id_mecanico: d.id_mecanico,
        id_lider: req.user.id_usuario,
        descripcion: d.descripcion,
        kilometraje_ingreso: d.kilometraje_ingreso,
        tiempo_asignado_min: d.tiempo_asignado_min,
        estado: 'pendiente',
      },
    });

    if (d.productos.length) {
      // subtotal es columna calculada: NO se envía
      await tx.detalle_orden_producto.createMany({
        data: d.productos.map((p) => ({
          id_orden_servicio: nueva.id_orden_servicio,
          id_producto: p.id_producto,
          cantidad: p.cantidad,
          precio_unitario: precios.get(p.id_producto),
        })),
      });
      await descontarStock(tx, nueva.id_orden_servicio, req.user.id_usuario);
    }

    // Actualiza el kilometraje del vehículo si el de ingreso es mayor
    await tx.vehiculo.updateMany({
      where: { id_vehiculo: vehiculo.id_vehiculo, kilometraje: { lt: d.kilometraje_ingreso } },
      data: { kilometraje: d.kilometraje_ingreso },
    });

    return tx.orden_servicio.findUnique({
      where: { id_orden_servicio: nueva.id_orden_servicio },
      select,
    });
  }, TX);

  res.status(201).json({ ok: true, orden: formatear(orden, new Date()) });
}

// Historial de órdenes (líder y administrador). ?estado=
export async function listar(req, res) {
  const where = {};
  if (req.sedeId) where.id_sede = req.sedeId;
  if (req.query.estado) where.estado = req.query.estado;

  const ahora = new Date();
  const ordenes = await prisma.orden_servicio.findMany({
    where,
    select,
    orderBy: { fecha_creacion: 'desc' },
    take: 100,
  });
  res.json({ ok: true, ordenes: ordenes.map((o) => formatear(o, ahora)) });
}

// RF-03: panel de la sede (órdenes activas), de menor a mayor tiempo restante
export async function panel(req, res) {
  const ahora = new Date();
  const ordenes = await prisma.orden_servicio.findMany({
    where: { id_sede: req.sedeId, estado: { in: ['pendiente', 'en_proceso'] } },
    select,
  });
  const lista = ordenes
    .map((o) => formatear(o, ahora))
    .sort((a, b) => a.tiempo_restante_seg - b.tiempo_restante_seg);
  res.json({ ok: true, ahora: ahora.toISOString(), ordenes: lista });
}

export async function obtener(req, res) {
  const where = { id_orden_servicio: Number(req.params.id) };
  if (req.sedeId) where.id_sede = req.sedeId; // RNF-10
  const o = await prisma.orden_servicio.findFirst({ where, select });
  if (!o) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada' });
  res.json({ ok: true, orden: formatear(o, new Date()) });
}

// Modificar (líder): solo mientras esté pendiente
export async function editar(req, res) {
  const datos = editarSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);

  await validarMecanico(datos.data.id_mecanico, req.sedeId);

  const r = await prisma.orden_servicio.updateMany({
    where: { id_orden_servicio: Number(req.params.id), id_sede: req.sedeId, estado: 'pendiente' },
    data: datos.data,
  });
  if (r.count === 0) {
    throw new ReglaError('La orden no existe o ya no está pendiente, por lo que no se puede modificar');
  }
  const o = await prisma.orden_servicio.findUnique({
    where: { id_orden_servicio: Number(req.params.id) },
    select,
  });
  res.json({ ok: true, orden: formatear(o, new Date()) });
}

// Anular (líder): pendiente o en_proceso. Devuelve el stock.
export async function anular(req, res) {
  const datos = anularSchema.safeParse(req.body);
  if (!datos.success) return invalido(res, datos.error);
  const id = Number(req.params.id);

  await prisma.$transaction(async (tx) => {
    const r = await tx.orden_servicio.updateMany({
      where: { id_orden_servicio: id, id_sede: req.sedeId, estado: { in: ['pendiente', 'en_proceso'] } },
      data: { estado: 'anulada', motivo_anulacion: datos.data.motivo },
    });
    if (r.count === 0) {
      throw new ReglaError('La orden no existe o ya no se puede anular (finalizada, cerrada o anulada)');
    }
    await devolverStock(tx, id, req.user.id_usuario);
  }, TX);

  res.json({ ok: true, mensaje: 'Orden anulada y stock devuelto' });
}

// RF-03/RF-11: el mecánico inicia su orden (arranca el conteo)
export async function iniciar(req, res) {
  const id = Number(req.params.id);
  let r;
  try {
    r = await prisma.orden_servicio.updateMany({
      where: {
        id_orden_servicio: id,
        id_sede: req.sedeId,
        id_mecanico: req.user.id_usuario, // solo la suya
        estado: 'pendiente',
      },
      data: { estado: 'en_proceso', hora_inicio: new Date() },
    });
  } catch (e) {
    // Índice único: un mecánico solo puede tener una orden en proceso
    if (e.code === 'P2002') {
      throw new ReglaError('Ya tienes una orden en proceso. Finalízala antes de iniciar otra.');
    }
    throw e;
  }
  if (r.count === 0) {
    throw new ReglaError('La orden no existe, no es tuya o ya fue iniciada');
  }
  res.json({ ok: true, mensaje: 'Orden iniciada' });
}

// RF-11: el mecánico finaliza su orden; se detiene el conteo
export async function finalizar(req, res) {
  const id = Number(req.params.id);
  const donde = {
    id_orden_servicio: id,
    id_sede: req.sedeId,
    id_mecanico: req.user.id_usuario,
    estado: 'en_proceso',
  };

  const o = await prisma.orden_servicio.findFirst({ where: donde });
  if (!o) throw new ReglaError('La orden no existe, no es tuya o no está en proceso');

  const fin = new Date();
  const tiempoReal = Math.max(1, Math.ceil((fin.getTime() - o.hora_inicio.getTime()) / 60000));

  const r = await prisma.orden_servicio.updateMany({
    where: donde,
    data: { estado: 'finalizada', hora_fin: fin, tiempo_real_min: tiempoReal },
  });
  if (r.count === 0) throw new ReglaError('La orden ya fue finalizada');

  res.json({ ok: true, mensaje: 'Orden finalizada', tiempo_real_min: tiempoReal });
}