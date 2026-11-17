import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';

const dinero = (n) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-CO') : '—');

const hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
const primeroDeMes = `${hoy.slice(0, 8)}01`;

const schema = z
  .object({
    desde: z.string().min(1, 'Obligatoria'),
    hasta: z.string().min(1, 'Obligatoria'),
    id_sede: z.string().optional(),
  })
  .refine((d) => d.desde <= d.hasta, {
    message: 'No puede ser anterior a la fecha inicial',
    path: ['hasta'],
  });

const aQuery = (f) => {
  const p = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
  if (f.id_sede) p.set('id_sede', f.id_sede);
  return p.toString();
};

function Tarjeta({ titulo, valor, clase = '' }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100">
        <div className="card-body">
          <div className="text-muted small">{titulo}</div>
          <div className={`fs-4 fw-bold ${clase}`}>{valor}</div>
        </div>
      </div>
    </div>
  );
}

export default function ReportesPage() {
  const [filtros, setFiltros] = useState(null); // se llena al pulsar "Generar"

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { desde: primeroDeMes, hasta: hoy, id_sede: '' },
  });

  const sedes = useQuery({ queryKey: ['sedes'], queryFn: () => api.get('/sedes') });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reportes', filtros],
    queryFn: () => api.get(`/reportes/cumplimiento?${aQuery(filtros)}`),
    enabled: !!filtros,
  });

  return (
    <>
      <PageHeader
        titulo="Reportes"
        subtitulo="Cumplimiento de tiempos por mecánico y demoras, con exportación a Excel"
      />

      <form className="card card-body mb-3" onSubmit={handleSubmit((f) => setFiltros(f))} noValidate>
        <div className="row g-3 align-items-start">
          <div className="col-12 col-md-3">
            <CampoForm label="Desde" error={errors.desde?.message}>
              <input type="date" className="form-control" {...register('desde')} />
            </CampoForm>
          </div>
          <div className="col-12 col-md-3">
            <CampoForm label="Hasta" error={errors.hasta?.message}>
              <input type="date" className="form-control" {...register('hasta')} />
            </CampoForm>
          </div>
          <div className="col-12 col-md-3">
            <CampoForm label="Sede" error={errors.id_sede?.message}>
              <select className="form-select" {...register('id_sede')}>
                <option value="">Todas las sedes</option>
                {sedes.data?.sedes?.map((s) => (
                  <option key={s.id_sede} value={s.id_sede}>
                    {s.ciudad}
                    {s.activo ? '' : ' (inactiva)'}
                  </option>
                ))}
              </select>
            </CampoForm>
          </div>
          <div className="col-12 col-md-3 d-flex gap-2 align-items-end" style={{ minHeight: 62 }}>
            <button className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Generando...' : 'Generar'}
            </button>
            {filtros && (
              <a className="btn btn-success" href={`/api/reportes/exportar?${aQuery(filtros)}`}>
                Descargar Excel
              </a>
            )}
          </div>
        </div>
      </form>

      <Mensaje tipo="danger">{error?.message}</Mensaje>
      {isLoading && <Cargando />}

      {!filtros && (
        <p className="text-muted">Elige el periodo y pulsa «Generar» para ver el reporte.</p>
      )}

      {data && (
        <>
          <p className="text-muted">
            <strong>{data.sede}</strong> · del {filtros.desde} al {filtros.hasta}
          </p>

          <div className="row g-3 mb-4">
            <Tarjeta titulo="Órdenes del periodo" valor={data.resumen.total_ordenes} />
            <Tarjeta
              titulo="A tiempo"
              valor={`${data.resumen.a_tiempo} (${data.resumen.pct_cumplimiento}%)`}
              clase="text-success"
            />
            <Tarjeta titulo="Con demora" valor={data.resumen.con_demora} clase="text-danger" />
            <Tarjeta titulo="Demora acumulada" valor={`${data.resumen.demora_total_min} min`} />
          </div>

          <h5>Cumplimiento por mecánico</h5>
          <div className="card mb-4">
            <div className="tabla-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Mecánico</th>
                    <th className="text-end">Órdenes</th>
                    <th className="text-end">A tiempo</th>
                    <th className="text-end">Con demora</th>
                    <th style={{ minWidth: 160 }}>Cumplimiento</th>
                    <th className="text-end">Demora total</th>
                    <th className="text-end">Demora prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mecanicos.map((m) => (
                    <tr key={m.id_mecanico}>
                      <td>{m.mecanico}</td>
                      <td className="text-end">{m.ordenes}</td>
                      <td className="text-end">{m.a_tiempo}</td>
                      <td className="text-end">{m.con_demora}</td>
                      <td>
                        <div className="progress" style={{ height: 18 }}>
                          <div
                            className={`progress-bar ${m.pct_cumplimiento >= 80 ? 'bg-success' : m.pct_cumplimiento >= 50 ? 'bg-warning text-dark' : 'bg-danger'}`}
                            style={{ width: `${m.pct_cumplimiento}%` }}
                          >
                            {m.pct_cumplimiento}%
                          </div>
                        </div>
                      </td>
                      <td className="text-end">{m.demora_total_min} min</td>
                      <td className="text-end">{m.demora_promedio_min} min</td>
                    </tr>
                  ))}
                  {data.mecanicos.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center text-muted py-4">
                        No hay órdenes finalizadas en este periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <h5>Detalle de órdenes</h5>
          <div className="card">
            <div className="tabla-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Vehículo y cliente</th>
                    <th>Mecánico</th>
                    <th className="text-end">Asignado</th>
                    <th className="text-end">Real</th>
                    <th className="text-end">Demora</th>
                    <th>Terminada</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle.map((d) => (
                    <tr key={d.id_orden_servicio}>
                      <td>#{d.id_orden_servicio}</td>
                      <td>
                        <strong>{d.placa}</strong>
                        <div className="text-muted small">{d.cliente}</div>
                      </td>
                      <td>{d.mecanico}</td>
                      <td className="text-end">{d.tiempo_asignado_min} min</td>
                      <td className="text-end">{d.tiempo_real_min} min</td>
                      <td className="text-end">
                        {d.cumplio ? (
                          <span className="badge bg-success">A tiempo</span>
                        ) : (
                          <span className="badge bg-danger">+{d.demora_min} min</span>
                        )}
                      </td>
                      <td className="text-nowrap">{fechaHora(d.hora_fin)}</td>
                      <td>
                        {d.estado === 'cerrada' ? (
                          <>
                            Cerrada
                            <div className="text-muted small">{dinero(d.valor_total)}</div>
                          </>
                        ) : (
                          'Finalizada'
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.detalle.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center text-muted py-4">
                        Sin órdenes en este periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}