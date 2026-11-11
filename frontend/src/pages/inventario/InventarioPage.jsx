import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Modal from '../../components/ui/Modal.jsx';

const TIPO_MOV = {
  entrada: 'Entrada',
  salida_orden: 'Salida por orden',
  devolucion_anulacion: 'Devolución por anulación',
  ajuste: 'Ajuste',
};

const dinero = (n) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/* ---------- Formulario de producto ---------- */

const productoSchema = z.object({
  nombre_producto: z.string().trim().min(1, 'Obligatorio').max(120),
  descripcion: z.string().trim().max(255).optional(),
  stock: z.coerce.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativo'),
  precio_unitario: z.coerce.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativo'),
  id_sede: z.string().optional(),
});

function FormProducto({ producto, sedes, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const esNuevo = !producto;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(
      productoSchema.superRefine((d, ctx) => {
        if (esNuevo && !d.id_sede) {
          ctx.addIssue({ code: 'custom', path: ['id_sede'], message: 'Selecciona una sede' });
        }
      })
    ),
    defaultValues: {
      nombre_producto: producto?.nombre_producto ?? '',
      descripcion: producto?.descripcion ?? '',
      stock: producto ? Number(producto.stock) : 0,
      precio_unitario: producto ? Number(producto.precio_unitario) : 0,
      id_sede: '',
    },
  });

  const guardar = useMutation({
    mutationFn: (d) => {
      if (esNuevo) {
        return api.post('/productos', {
          nombre_producto: d.nombre_producto,
          descripcion: d.descripcion || null,
          stock: d.stock,
          precio_unitario: d.precio_unitario,
          id_sede: Number(d.id_sede),
        });
      }
      return api.put(`/productos/${producto.id_producto}`, {
        nombre_producto: d.nombre_producto,
        descripcion: d.descripcion || null,
        precio_unitario: d.precio_unitario,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      onGuardado(esNuevo ? 'Producto creado correctamente' : 'Producto actualizado correctamente');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <Mensaje tipo="danger">{error}</Mensaje>

      {esNuevo && (
        <CampoForm label="Sede" error={errors.id_sede?.message}>
          <select className="form-select" {...register('id_sede')}>
            <option value="">Selecciona una sede</option>
            {sedes.map((s) => (
              <option key={s.id_sede} value={s.id_sede}>
                {s.ciudad} - {s.direccion}
              </option>
            ))}
          </select>
        </CampoForm>
      )}

      <CampoForm label="Nombre del producto" error={errors.nombre_producto?.message}>
        <input className="form-control" {...register('nombre_producto')} />
      </CampoForm>
      <CampoForm label="Descripción (opcional)" error={errors.descripcion?.message}>
        <input className="form-control" {...register('descripcion')} />
      </CampoForm>
      <div className="row">
        {esNuevo && (
          <div className="col-md-6">
            <CampoForm label="Stock inicial" error={errors.stock?.message}>
              <input type="number" min="0" step="0.01" className="form-control" {...register('stock')} />
            </CampoForm>
          </div>
        )}
        <div className={esNuevo ? 'col-md-6' : 'col-12'}>
          <CampoForm label="Precio unitario (COP)" error={errors.precio_unitario?.message}>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              {...register('precio_unitario')}
            />
          </CampoForm>
        </div>
      </div>
      {!esNuevo && (
        <div className="form-text mb-3">
          El stock se modifica solo con entradas de existencias o con las órdenes de servicio.
        </div>
      )}

      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Formulario de entrada de existencias ---------- */

const entradaSchema = z.object({
  cantidad: z.coerce.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a 0'),
  nota: z.string().trim().max(255).optional(),
});

function FormEntrada({ producto, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(entradaSchema), defaultValues: { cantidad: '', nota: '' } });

  const guardar = useMutation({
    mutationFn: (d) =>
      api.post(`/productos/${producto.id_producto}/entradas`, {
        cantidad: d.cantidad,
        nota: d.nota || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      onGuardado('Entrada registrada correctamente');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <p className="text-muted">
        <strong>{producto.nombre_producto}</strong> · stock actual: {Number(producto.stock)}
      </p>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Cantidad que ingresa" error={errors.cantidad?.message}>
        <input type="number" min="0" step="0.01" className="form-control" {...register('cantidad')} />
      </CampoForm>
      <CampoForm label="Nota (opcional)" error={errors.nota?.message}>
        <input className="form-control" placeholder="Ej: compra a proveedor" {...register('nota')} />
      </CampoForm>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando...' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Historial de movimientos ---------- */

function Historial({ producto }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['movimientos', producto.id_producto],
    queryFn: () => api.get(`/productos/${producto.id_producto}/movimientos`),
  });

  return (
    <>
      <p className="text-muted">
        <strong>{producto.nombre_producto}</strong> · stock actual: {Number(producto.stock)}
      </p>
      <Mensaje tipo="danger">{error?.message}</Mensaje>
      {isLoading && <Cargando />}
      {data && (
        <div className="tabla-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th className="text-end">Cantidad</th>
                <th>Usuario</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos.map((m) => (
                <tr key={m.id_movimiento}>
                  <td className="text-nowrap">{new Date(m.fecha).toLocaleString('es-CO')}</td>
                  <td>{TIPO_MOV[m.tipo]}</td>
                  <td className="text-end">{Number(m.cantidad)}</td>
                  <td>
                    {m.usuario.nombre} {m.usuario.apellido}
                  </td>
                  <td>{m.nota || (m.id_orden_servicio ? `Orden #${m.id_orden_servicio}` : '—')}</td>
                </tr>
              ))}
              {data.movimientos.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-3">
                    Sin movimientos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Página ---------- */

export default function InventarioPage() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ id_sede: '', busqueda: '' });
  const q = useDebounce(filtros.busqueda.trim(), 400);
  // tipo: 'producto' | 'entrada' | 'historial'
  const [modal, setModal] = useState({ tipo: null, producto: null });
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => api.get('/sedes'),
  });
  const sedesActivas = (sedesData?.sedes ?? []).filter((s) => s.activo);

  const params = new URLSearchParams();
  if (filtros.id_sede) params.set('id_sede', filtros.id_sede);
  if (q) params.set('q', q);
  const qs = params.toString();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['productos', filtros.id_sede, q],
    queryFn: () => api.get(`/productos${qs ? `?${qs}` : ''}`),
    placeholderData: (anterior) => anterior,
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activo }) => api.patch(`/productos/${id}/estado`, { activo }),

    onMutate: async ({ id, activo }) => {
      setAviso(null);
      await queryClient.cancelQueries({ queryKey: ['productos'] });
      const anteriores = queryClient.getQueriesData({ queryKey: ['productos'] });
      queryClient.setQueriesData({ queryKey: ['productos'] }, (datos) =>
        datos
          ? {
              ...datos,
              productos: datos.productos.map((p) => (p.id_producto === id ? { ...p, activo } : p)),
            }
          : datos
      );
      return { anteriores };
    },
    onSuccess: (_r, { activo }) =>
      mostrar('success', activo ? 'Producto activado correctamente' : 'Producto desactivado correctamente'),
    onError: (e, _vars, contexto) => {
      contexto.anteriores.forEach(([clave, datos]) => queryClient.setQueryData(clave, datos));
      mostrar('danger', e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['productos'] }),
  });

  const cerrar = () => setModal({ tipo: null, producto: null });

  return (
    <>
      <PageHeader titulo="Inventario" subtitulo="Productos, existencias y movimientos por sede">
        <button className="btn btn-primary" onClick={() => setModal({ tipo: 'producto', producto: null })}>
          Nuevo producto
        </button>
      </PageHeader>

      <div className="row g-2 mb-3">
        <div className="col-12 col-md-4">
          <select
            className="form-select"
            value={filtros.id_sede}
            onChange={(e) => setFiltros({ ...filtros, id_sede: e.target.value })}
          >
            <option value="">Todas las sedes</option>
            {(sedesData?.sedes ?? []).map((s) => (
              <option key={s.id_sede} value={s.id_sede}>
                {s.ciudad} - {s.direccion}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-5">
          <input
            className="form-control"
            placeholder="Buscar producto por nombre"
            value={filtros.busqueda}
            onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })}
          />
          {isFetching && <div className="form-text">Buscando...</div>}
        </div>
      </div>

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
                  <th>Producto</th>
                  <th>Sede</th>
                  <th className="text-end">Stock</th>
                  <th className="text-end">Precio</th>
                  <th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.productos.map((p) => {
                  const procesando =
                    cambiarEstado.isPending && cambiarEstado.variables?.id === p.id_producto;
                  return (
                    <tr key={p.id_producto}>
                      <td>
                        {p.nombre_producto}
                        <div className="text-muted small">{p.descripcion || ''}</div>
                      </td>
                      <td>
                        {p.sede.ciudad} - {p.sede.direccion}
                      </td>
                      <td className="text-end">{Number(p.stock)}</td>
                      <td className="text-end">{dinero(p.precio_unitario)}</td>
                      <td>
                        <span className={`badge ${p.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        <button
                          className="btn btn-sm btn-outline-success me-1"
                          onClick={() => setModal({ tipo: 'entrada', producto: p })}
                        >
                          Entrada
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => setModal({ tipo: 'historial', producto: p })}
                        >
                          Historial
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => setModal({ tipo: 'producto', producto: p })}
                        >
                          Editar
                        </button>
                        <button
                          className={`btn btn-sm ${p.activo ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          disabled={procesando}
                          onClick={() => cambiarEstado.mutate({ id: p.id_producto, activo: !p.activo })}
                        >
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {data.productos.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-4">
                      No hay productos con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        abierto={modal.tipo === 'producto'}
        titulo={modal.producto ? 'Editar producto' : 'Nuevo producto'}
        onCerrar={cerrar}
      >
        <FormProducto
          producto={modal.producto}
          sedes={sedesActivas}
          onGuardado={(t) => {
            cerrar();
            mostrar('success', t);
          }}
          onCancelar={cerrar}
        />
      </Modal>

      <Modal abierto={modal.tipo === 'entrada'} titulo="Registrar entrada de existencias" onCerrar={cerrar}>
        {modal.producto && (
          <FormEntrada
            producto={modal.producto}
            onGuardado={(t) => {
              cerrar();
              mostrar('success', t);
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>

      <Modal abierto={modal.tipo === 'historial'} titulo="Historial de movimientos" onCerrar={cerrar}>
        {modal.producto && <Historial producto={modal.producto} />}
      </Modal>
    </>
  );
}