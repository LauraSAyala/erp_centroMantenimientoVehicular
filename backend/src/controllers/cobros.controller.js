import { z } from 'zod';
import { prisma } from '../db.js';
import { ReglaError } from '../services/reglas.js';

const select = {
  id_orden_servicio: true,
  descripcion: true,
  estado: true,
  tiempo_asignado_min: true,
  tiempo_real_min: true,
  hora_inicio: true,
  hora_fin: true,
  valor_servicio: true,
  valor_productos: true,
  valor_total: true,
  fecha_cierre: true,
  vehiculo: { select: { placa: true, tipo_vehiculo: true } },
  cliente: { select: { nombre: true, apellido: true, identificacion: true } },
  usuario_orden_servicio_id_mecanicoTousuario: { select: { nombre: true, apellido: true } },
  detalle_orden_producto: {
    select: {
      cantidad: true,
      precio_unitario: true,
      producto: { select: { nombre_producto: true } },
    },
  },
};

const redondear = (n) => Math.round(n * 100) / 100;

// Suma de los productos usados (cantidad x precio guardado en la orden)
function totalProductos(o) {
  return redondear(
    o.detalle_orden_producto.reduce(
      (acc, d) => acc + Number(d.cantidad) * Number(d.precio_unitario),
      0
    )
  );
}

function formatear(o) {
  const { usuario_orden_servicio_id_mecanicoTousuario: mecanico, ...resto } = o;
  return { ...resto, mecanico, valor_productos_calculado: totalProductos(o) };
}

const cerrarSchema = z.object({
  valor_servicio: z.coerce
    .number({ error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(9999999999, 'Valor demasiado alto'),
});

// ?estado=finalizada (pendientes de cobro, por defecto) | cerrada (historial)
export async function listar(req, res) {
  const estado = req.query.estado === 'cerrada' ? 'cerrada' : 'finalizada';
  const ordenes = await prisma.orden_servicio.findMany({
    where: { id_sede: req.sedeId, estado },
    select,
    orderBy: estado === 'cerrada' ? { fecha_cierre: 'desc' } : { hora_fin: 'asc' },
    take: 100,
  });
  res.json({ ok: true, ordenes: ordenes.map(formatear) });
}

// RF-08: registrar el cobro y cerrar la orden
export async function cerrar(req, res) {
  const datos = cerrarSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Datos inválidos',
      errores: z.flattenError(datos.error).fieldErrors,
    });
  }
  const id = Number(req.params.id);

  // RNF-10: la orden debe ser de la sede del cajero
  const orden = await prisma.orden_servicio.findFirst({
    where: { id_orden_servicio: id, id_sede: req.sedeId },
    select,
  });
  if (!orden) throw new ReglaError('Orden no encontrada', 404);

  if (orden.estado === 'cerrada') {
    throw new ReglaError('La orden ya está cerrada y no se puede modificar');
  }
  if (orden.estado !== 'finalizada') {
    throw new ReglaError('Solo se pueden cerrar órdenes finalizadas');
  }

  const valorServicio = redondear(datos.data.valor_servicio);
  const valorProductos = totalProductos(orden);
  const valorTotal = redondear(valorServicio + valorProductos);

  // El estado esperado va en el where: si dos cajeros cierran a la vez, solo uno gana
  const r = await prisma.orden_servicio.updateMany({
    where: { id_orden_servicio: id, id_sede: req.sedeId, estado: 'finalizada' },
    data: {
      estado: 'cerrada',
      id_cajero: req.user.id_usuario,
      valor_servicio: valorServicio,
      valor_productos: valorProductos,
      valor_total: valorTotal,
      fecha_cierre: new Date(),
    },
  });
  if (r.count === 0) throw new ReglaError('La orden ya fue cerrada por otro usuario');

  res.json({
    ok: true,
    mensaje: 'Orden cerrada correctamente',
    valor_servicio: valorServicio,
    valor_productos: valorProductos,
    valor_total: valorTotal,
  });
}