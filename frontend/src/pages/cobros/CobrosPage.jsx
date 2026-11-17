import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Modal from '../../components/ui/Modal.jsx';

const dinero = (n) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-CO') : '—');

const schema = z.object({
  valor_servicio: z.coerce
    .number({ error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(9999999999, 'Valor demasiado alto'),
});

/* ---------- Formulario de cobro ---------- */

function FormCobro({ orden, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { valor_servicio: '' } });

  const valorServicio = Number(useWatch({ control, name: 'valor_servicio' })) || 0;
  const total = valorServicio + orden.valor_productos_calculado;

  const cerrar = useMutation({
    mutationFn: (d) => api.post(`/cobros/${orden.id_orden_servicio}/cerrar`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cobros'] });
      onGuardado('Orden cerrada correctamente');
    },
    onError: (e) => {
      setError(e.message);
      queryClient.invalidateQueries({ queryKey: ['cobros'] });
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => cerrar.mutate(d))} noValidate>
      <div className="mb-3">
        <div>
          <strong>{orden.vehiculo.placa}</strong> · {orden.cliente.nombre} {orden.cliente.apellido}
        </div>
        <div className="text-muted small">
          Mecánico: {orden.mecanico.nombre} {orden.mecanico.apellido} · Tiempo real:{' '}
          {orden.tiempo_real_min} min (asignado {orden.tiempo_asignado_min} min)
        </div>
        <div className="mt-2">{orden.descripcion}</div>
      </div>

      <div className="tabla-responsive mb-3">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-end">Cant.</th>
              <th className="text-end">Precio</th>
              <th className="text-end">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {orden.detalle_orden_producto.map((d, i) => (
              <tr key={i}>
                <td>{d.producto.nombre_producto}</td>
                <td className="text-end">{Number(d.cantidad)}</td>
                <td className="text-end">{dinero(d.precio_unitario)}</td>
                <td className="text-end">{dinero(Number(d.cantidad) * Number(d.precio_unitario))}</td>
              </tr>
            ))}
            {orden.detalle_orden_producto.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center text-muted">
                  Sin productos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Mensaje tipo="danger">{error}</Mensaje>

      <CampoForm label="Valor del servicio (mano de obra, COP)" error={errors.valor_servicio?.message}>
        <input type="number" min="0" step="1" className="form-control" {...register('valor_servicio')} />
      </CampoForm>

      <div className="border rounded p-3 mb-3 bg-light">
        <div className="d-flex justify-content-between">
          <span>Servicio</span>
          <span>{dinero(valorServicio)}</span>
        </div>
        <div className="d-flex justify-content-between">
          <span>Productos</span>
          <span>{dinero(orden.valor_productos_calculado)}</span>
        </div>
        <hr className="my-2" />
        <div className="d-flex justify-content-between fw-bold fs-5">
          <span>Total a cobrar</span>
          <span>{dinero(total)}</span>
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn btn-success" disabled={cerrar.isPending}>
          {cerrar.isPending ? 'Cerrando...' : 'Registrar cobro y cerrar orden'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Página ---------- */

export default function CobrosPage() {
  const [vista, setVista] = useState('finalizada'); // finalizada = pendientes | cerrada = historial
  const [modal, setModal] = useState({ abierto: false, orden: null });
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  const { data, isLoading, error } = useQuery({
    queryKey: ['cobros', vista],
    queryFn: () => api.get(`/cobros?estado=${vista}`),
    refetchInterval: 15000,
  });

  const cerrarModal = () => setModal({ abierto: false, orden: null });
  const pendientes = vista === 'finalizada';

  return (
    <>
      <PageHeader titulo="Cobros" subtitulo="Registra el cobro de las órdenes finalizadas de tu sede" />

      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${pendientes ? 'active' : ''}`}
            onClick={() => setVista('finalizada')}
          >
            Pendientes de cobro
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${!pendientes ? 'active' : ''}`}
            onClick={() => setVista('cerrada')}
          >
            Órdenes cerradas
          </button>
        </li>
      </ul>

      {aviso && (
        <Mensaje key={aviso.id} tipo={aviso.tipo}>
          {aviso.texto}
        </Mensaje>
      )}
      <Mensaje tipo="danger">{error?.message}</Mensaje>
      {isLoading && <Cargando />}

      {data && (
        <div className="card">
          <div className="tabla-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Vehículo y cliente</th>
                  <th>Servicio</th>
                  <th>Tiempo</th>
                  {pendientes ? (
                    <>
                      <th className="text-end">Productos</th>
                      <th className="text-end">Acciones</th>
                    </>
                  ) : (
                    <>
                      <th className="text-end">Total</th>
                      <th>Cerrada el</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.ordenes.map((o) => (
                  <tr key={o.id_orden_servicio}>
                    <td>#{o.id_orden_servicio}</td>
                    <td>
                      <strong>{o.vehiculo.placa}</strong>
                      <div className="text-muted small">
                        {o.cliente.nombre} {o.cliente.apellido}
                      </div>
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {o.descripcion}
                      <div className="text-muted small">
                        Mecánico: {o.mecanico.nombre} {o.mecanico.apellido}
                      </div>
                    </td>
                    <td className="text-nowrap">
                      {o.tiempo_real_min} min
                      <div className="text-muted small">Asignado: {o.tiempo_asignado_min} min</div>
                    </td>
                    {pendientes ? (
                      <>
                        <td className="text-end">{dinero(o.valor_productos_calculado)}</td>
                        <td className="text-end text-nowrap">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => setModal({ abierto: true, orden: o })}
                          >
                            Cobrar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-end">
                          <strong>{dinero(o.valor_total)}</strong>
                          <div className="text-muted small">
                            Serv. {dinero(o.valor_servicio)} + Prod. {dinero(o.valor_productos)}
                          </div>
                        </td>
                        <td className="text-nowrap">{fechaHora(o.fecha_cierre)}</td>
                      </>
                    )}
                  </tr>
                ))}
                {data.ordenes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-4">
                      {pendientes ? 'No hay órdenes pendientes de cobro.' : 'Aún no hay órdenes cerradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal abierto={modal.abierto} titulo="Registrar cobro" onCerrar={cerrarModal}>
        {modal.orden && (
          <FormCobro
            orden={modal.orden}
            onGuardado={(t) => {
              cerrarModal();
              mostrar('success', t);
            }}
            onCancelar={cerrarModal}
          />
        )}
      </Modal>
    </>
  );
}
