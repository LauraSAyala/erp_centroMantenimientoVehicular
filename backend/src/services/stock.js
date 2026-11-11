// Funciones de stock para usar DENTRO de una transacción de Prisma:
//
//   await prisma.$transaction(async (tx) => {
//     const orden = await tx.orden_servicio.create({ ... });
//     await descontarStock(tx, orden.id_orden_servicio, idUsuario);
//   });

export class StockError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'StockError';
    this.status = 409;
  }
}

// Descuenta el stock de los productos del detalle de la orden.
// Falla (y la transacción se revierte) si algún producto no alcanza.
export async function descontarStock(tx, idOrden, idUsuario) {
  const detalles = await tx.detalle_orden_producto.findMany({
    where: { id_orden_servicio: idOrden },
    include: { producto: true },
  });

  for (const d of detalles) {
    // Descuento atómico: solo se actualiza si hay stock suficiente
    const r = await tx.producto.updateMany({
      where: { id_producto: d.id_producto, stock: { gte: d.cantidad }, activo: true },
      data: { stock: { decrement: d.cantidad } },
    });
    if (r.count === 0) {
      throw new StockError(
        `Stock insuficiente o producto inactivo: ${d.producto.nombre_producto}`
      );
    }
    await tx.movimiento_inventario.create({
      data: {
        id_producto: d.id_producto,
        tipo: 'salida_orden',
        cantidad: d.cantidad,
        id_orden_servicio: idOrden,
        id_usuario: idUsuario,
      },
    });
  }
}

// Devuelve al inventario lo descontado por la orden (al anularla).
export async function devolverStock(tx, idOrden, idUsuario) {
  const detalles = await tx.detalle_orden_producto.findMany({
    where: { id_orden_servicio: idOrden },
  });

  for (const d of detalles) {
    await tx.producto.update({
      where: { id_producto: d.id_producto },
      data: { stock: { increment: d.cantidad } },
    });
    await tx.movimiento_inventario.create({
      data: {
        id_producto: d.id_producto,
        tipo: 'devolucion_anulacion',
        cantidad: d.cantidad,
        id_orden_servicio: idOrden,
        id_usuario: idUsuario,
      },
    });
  }
}