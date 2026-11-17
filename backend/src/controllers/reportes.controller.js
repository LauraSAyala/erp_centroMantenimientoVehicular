import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../db.js';
import { ReglaError } from '../services/reglas.js';

const OFFSET_COL_MS = 5 * 60 * 60 * 1000; // Colombia = UTC-5

const fecha = z
  .string({ error: 'Fecha obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD');

const filtrosSchema = z
  .object({
    desde: fecha,
    hasta: fecha,
    id_sede: z.string().regex(/^\d+$/, 'Sede inválida').optional(),
  })
  .refine((d) => d.desde <= d.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['hasta'],
  });

const redondear = (n) => Math.round(n * 100) / 100;
const porcentaje = (parte, total) => (total === 0 ? 0 : redondear((parte / total) * 100));

function leerFiltros(req) {
  const f = filtrosSchema.safeParse(req.query);
  if (!f.success) {
    const e = z.flattenError(f.error);
    const mensaje = [...Object.values(e.fieldErrors).flat(), ...e.formErrors][0] ?? 'Filtros inválidos';
    throw new ReglaError(mensaje, 400);
  }
  const inicio = new Date(`${f.data.desde}T00:00:00-05:00`);
  const fin = new Date(`${f.data.hasta}T23:59:59.999-05:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    throw new ReglaError('Fecha inválida', 400);
  }
  if ((fin - inicio) / 86400000 > 366) {
    throw new ReglaError('El rango máximo es de un año', 400);
  }
  return { desde: f.data.desde, hasta: f.data.hasta, inicio, fin };
}

const select = {
  id_orden_servicio: true,
  id_mecanico: true,
  descripcion: true,
  estado: true,
  tiempo_asignado_min: true,
  tiempo_real_min: true,
  hora_inicio: true,
  hora_fin: true,
  valor_total: true,
  sede: { select: { ciudad: true } },
  vehiculo: { select: { placa: true } },
  cliente: { select: { nombre: true, apellido: true } },
  usuario_orden_servicio_id_mecanicoTousuario: { select: { nombre: true, apellido: true } },
};

async function consultar(req) {
  const filtros = leerFiltros(req);

  // req.sedeId: para el administrador es ?id_sede= o null (todas)
  const where = {
    estado: { in: ['finalizada', 'cerrada'] },
    hora_fin: { gte: filtros.inicio, lte: filtros.fin },
  };
  if (req.sedeId) where.id_sede = req.sedeId;

  const ordenes = await prisma.orden_servicio.findMany({
    where,
    select,
    orderBy: { hora_fin: 'desc' },
  });

  let sedeNombre = 'Todas las sedes';
  if (req.sedeId) {
    const sede = await prisma.sede.findUnique({ where: { id_sede: req.sedeId } });
    if (!sede) throw new ReglaError('Sede no encontrada', 404);
    sedeNombre = `${sede.ciudad} - ${sede.direccion}`;
  }

  const detalle = ordenes.map((o) => {
    const m = o.usuario_orden_servicio_id_mecanicoTousuario;
    const demora = Math.max(0, o.tiempo_real_min - o.tiempo_asignado_min);
    return {
      id_orden_servicio: o.id_orden_servicio,
      id_mecanico: o.id_mecanico,
      sede: o.sede.ciudad,
      placa: o.vehiculo.placa,
      cliente: `${o.cliente.nombre} ${o.cliente.apellido}`,
      mecanico: `${m.nombre} ${m.apellido}`,
      descripcion: o.descripcion,
      estado: o.estado,
      tiempo_asignado_min: o.tiempo_asignado_min,
      tiempo_real_min: o.tiempo_real_min,
      demora_min: demora,
      cumplio: demora === 0,
      hora_inicio: o.hora_inicio,
      hora_fin: o.hora_fin,
      valor_total: o.valor_total === null ? null : Number(o.valor_total),
    };
  });

  // Agrupar por mecánico
  const mapa = new Map();
  for (const d of detalle) {
    let m = mapa.get(d.id_mecanico);
    if (!m) {
      m = {
        id_mecanico: d.id_mecanico,
        mecanico: d.mecanico,
        ordenes: 0,
        a_tiempo: 0,
        con_demora: 0,
        minutos_asignados: 0,
        minutos_reales: 0,
        demora_total_min: 0,
      };
      mapa.set(d.id_mecanico, m);
    }
    m.ordenes += 1;
    m.minutos_asignados += d.tiempo_asignado_min;
    m.minutos_reales += d.tiempo_real_min;
    if (d.cumplio) m.a_tiempo += 1;
    else {
      m.con_demora += 1;
      m.demora_total_min += d.demora_min;
    }
  }
  const mecanicos = [...mapa.values()]
    .map((m) => ({
      ...m,
      pct_cumplimiento: porcentaje(m.a_tiempo, m.ordenes),
      demora_promedio_min: m.con_demora ? redondear(m.demora_total_min / m.con_demora) : 0,
    }))
    .sort((a, b) => a.mecanico.localeCompare(b.mecanico));

  const aTiempo = detalle.filter((d) => d.cumplio).length;
  const demoraTotal = detalle.reduce((acc, d) => acc + d.demora_min, 0);
  const resumen = {
    total_ordenes: detalle.length,
    a_tiempo: aTiempo,
    con_demora: detalle.length - aTiempo,
    pct_cumplimiento: porcentaje(aTiempo, detalle.length),
    demora_total_min: demoraTotal,
    valor_total_cobrado: redondear(detalle.reduce((acc, d) => acc + (d.valor_total ?? 0), 0)),
  };

  return { filtros, sedeNombre, resumen, mecanicos, detalle };
}

// Vista en pantalla (JSON)
export async function cumplimiento(req, res) {
  const { sedeNombre, resumen, mecanicos, detalle } = await consultar(req);
  res.json({ ok: true, sede: sedeNombre, resumen, mecanicos, detalle });
}

/* ---------- Exportación a Excel ---------- */

// ExcelJS guarda las fechas como UTC; se restan 5 h para que Excel muestre hora de Colombia
const aHoraCol = (d) => (d ? new Date(d.getTime() - OFFSET_COL_MS) : null);

function estilarEncabezado(hoja) {
  const fila = hoja.getRow(hoja.rowCount > 0 ? hoja.getRow(1).number : 1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  fila.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fila.height = 28;
}

export async function exportar(req, res) {
  const { filtros, sedeNombre, resumen, mecanicos, detalle } = await consultar(req);

  const wb = new ExcelJS.Workbook();
  wb.creator = `${req.user.nombre} ${req.user.apellido}`;
  wb.created = new Date();

  // Hoja 1: Resumen
  const h1 = wb.addWorksheet('Resumen');
  h1.columns = [
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Valor', key: 'valor', width: 36 },
  ];
  estilarEncabezado(h1);
  h1.addRows([
    { concepto: 'Sede', valor: sedeNombre },
    { concepto: 'Desde', valor: filtros.desde },
    { concepto: 'Hasta', valor: filtros.hasta },
    { concepto: 'Generado por', valor: `${req.user.nombre} ${req.user.apellido}` },
    { concepto: 'Órdenes en el periodo', valor: resumen.total_ordenes },
    { concepto: 'Órdenes a tiempo', valor: resumen.a_tiempo },
    { concepto: 'Órdenes con demora', valor: resumen.con_demora },
    { concepto: '% de cumplimiento', valor: resumen.pct_cumplimiento / 100 },
    { concepto: 'Demora acumulada (min)', valor: resumen.demora_total_min },
    { concepto: 'Total cobrado (COP)', valor: resumen.valor_total_cobrado },
  ]);
  h1.getCell('B9').numFmt = '0.0%';
  h1.getCell('B11').numFmt = '"$"#,##0';
  h1.getColumn('valor').alignment = { horizontal: 'left' };

  // Hoja 2: Cumplimiento por mecánico
  const h2 = wb.addWorksheet('Por mecánico');
  h2.columns = [
    { header: 'Mecánico', key: 'mecanico', width: 28 },
    { header: 'Órdenes', key: 'ordenes', width: 11 },
    { header: 'A tiempo', key: 'a_tiempo', width: 11 },
    { header: 'Con demora', key: 'con_demora', width: 13 },
    { header: '% cumplimiento', key: 'pct', width: 16 },
    { header: 'Min. asignados', key: 'minutos_asignados', width: 15 },
    { header: 'Min. reales', key: 'minutos_reales', width: 13 },
    { header: 'Demora total (min)', key: 'demora_total_min', width: 18 },
    { header: 'Demora promedio (min)', key: 'demora_promedio_min', width: 21 },
  ];
  estilarEncabezado(h2);
  for (const m of mecanicos) h2.addRow({ ...m, pct: m.pct_cumplimiento / 100 });
  h2.getColumn('pct').numFmt = '0.0%';
  h2.views = [{ state: 'frozen', ySplit: 1 }];

  // Hoja 3: Detalle de órdenes
  const h3 = wb.addWorksheet('Detalle de órdenes');
  h3.columns = [
    { header: 'N.º orden', key: 'id_orden_servicio', width: 11 },
    { header: 'Sede', key: 'sede', width: 16 },
    { header: 'Placa', key: 'placa', width: 10 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Mecánico', key: 'mecanico', width: 26 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Min. asignados', key: 'tiempo_asignado_min', width: 15 },
    { header: 'Min. reales', key: 'tiempo_real_min', width: 13 },
    { header: 'Demora (min)', key: 'demora_min', width: 14 },
    { header: 'Cumplió', key: 'cumplio', width: 10 },
    { header: 'Inicio', key: 'hora_inicio', width: 19 },
    { header: 'Fin', key: 'hora_fin', width: 19 },
    { header: 'Total cobrado', key: 'valor_total', width: 16 },
  ];
  estilarEncabezado(h3);
  for (const d of detalle) {
    h3.addRow({
      ...d,
      cumplio: d.cumplio ? 'Sí' : 'No',
      hora_inicio: aHoraCol(d.hora_inicio),
      hora_fin: aHoraCol(d.hora_fin),
    });
  }
  h3.getColumn('hora_inicio').numFmt = 'dd/mm/yyyy hh:mm';
  h3.getColumn('hora_fin').numFmt = 'dd/mm/yyyy hh:mm';
  h3.getColumn('valor_total').numFmt = '"$"#,##0';
  h3.getColumn('descripcion').alignment = { wrapText: true, vertical: 'top' };
  h3.autoFilter = { from: 'A1', to: 'N1' };
  h3.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="reporte_${filtros.desde}_${filtros.hasta}.xlsx"`
  );
  await wb.xlsx.write(res);
  res.end();
}