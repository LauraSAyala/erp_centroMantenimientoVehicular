import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import BuscadorPlaca from '../../components/BuscadorPlaca.jsx';

const ESTADO_TEXTO = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  finalizada: 'Finalizada',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
};

const ESTADO_BADGE = {
  pendiente: 'text-bg-secondary',
  en_proceso: 'text-bg-primary',
  finalizada: 'text-bg-info',
  cerrada: 'text-bg-success',
  anulada: 'text-bg-danger',
};

/* ---------- Crear orden ---------- */

const crearSchema = z
  .object({
    id_mecanico: z.string().min(1, 'Selecciona un mecánico'),
    descripcion: z.string().trim().min(1, 'Obligatoria').max(2000),
    kilometraje_ingreso: z.coerce.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativo'),
    tiempo_asignado_min: z.coerce
      .number({ error: 'Debe ser un número' })
      .int('Debe ser un número entero')
      .min(1, 'Mínimo 1 minuto')
      .max(1440, 'Máximo 1440 minutos'),
    productos: z.array(
      z.object({
        id_producto: z.string(),
        cantidad: z.coerce.number({ error: 'Número' }).positive('Mayor a 0'),
      })
    ),
  })
  .superRefine((d, ctx) => {
    const ids = d.productos.map((p) => p.id_producto).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['productos'], message: 'Hay productos repetidos' });
    }
    d.productos.forEach((p, i) => {
      if (!p.id_producto) {
        ctx.addIssue({
          code: 'custom',
          path: ['productos', i, 'id_producto'],
          message: 'Selecciona un producto',
        });
      }
    });
  });

/* ---------- Registro rápido de cliente + vehículo ---------- */

const rapidoSchema = z
  .object({
    modo: z.enum(['existente', 'nuevo']),
    id_cliente: z.string().optional(),
    identificacion: z.string().trim().max(20).optional(),
    nombre: z.string().trim().max(80).optional(),
    apellido: z.string().trim().max(80).optional(),
    telefono: z.string().trim().max(20).optional(),
    email: z.union([z.email('Correo inválido').max(120), z.literal('')]).optional(),
    tipo_vehiculo: z.enum(['carro', 'moto', 'camion']),
    kilometraje: z.coerce.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativo'),
  })
  .superRefine((d, ctx) => {
    if (d.modo === 'existente') {
      if (!d.id_cliente) {
        ctx.addIssue({ code: 'custom', path: ['id_cliente'], message: 'Selecciona un cliente de la lista' });
      }
    } else {
      if (!d.identificacion) ctx.addIssue({ code: 'custom', path: ['identificacion'], message: 'Obligatoria' });
      if (!d.nombre) ctx.addIssue({ code: 'custom', path: ['nombre'], message: 'Obligatorio' });
      if (!d.apellido) ctx.addIssue({ code: 'custom', path: ['apellido'], message: 'Obligatorio' });
    }
  });

function RegistroRapido({ placa, onRegistrado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const q = useDebounce(busqueda.trim(), 400);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(rapidoSchema),
    defaultValues: {
      modo: 'nuevo',
      id_cliente: '',
      identificacion: '',
      nombre: '',
      apellido: '',
      telefono: '',
      email: '',
      tipo_vehiculo: 'carro',
      kilometraje: 0,
    },
  });
  const modo = watch('modo');
  const idCliente = watch('id_cliente');

  const { data: clientesData, isFetching } = useQuery({
    queryKey: ['clientes', q],
    queryFn: () => api.get(`/clientes?q=${encodeURIComponent(q)}`),
    enabled: modo === 'existente' && q.length >= 2,
  });
  const clientes = clientesData?.clientes ?? [];

  const registrar = useMutation({
    mutationFn: async (d) => {
      let cliente;
      if (d.modo === 'nuevo') {
        const r = await api.post('/clientes', {
          identificacion: d.identificacion,
          nombre: d.nombre,
          apellido: d.apellido,
          telefono: d.telefono || null,
          email: d.email || null,
        });
        cliente = r.cliente;
      } else {
        cliente = clientes.find((c) => String(c.id_cliente) === d.id_cliente);
      }
      const v = await api.post('/vehiculos', {
        placa,
        tipo_vehiculo: d.tipo_vehiculo,
        kilometraje: d.kilometraje,
        id_cliente: cliente.id_cliente,
      });
      return v.vehiculo;
    },
    onSuccess: (vehiculo) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['vehiculo-placa'] });
      onRegistrado(vehiculo);
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="border rounded p-3 mb-3 bg-light">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <div className="fw-semibold">Registrar placa {placa}</div>
          <div className="text-muted small">Se guardará el vehículo y quedará seleccionado para esta orden.</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
      </div>

      <Mensaje tipo="danger">{error}</Mensaje>

      <div className="btn-group w-100 mb-3" role="group">
        <input type="radio" className="btn-check" id="modo-nuevo" value="nuevo" {...register('modo')} />
        <label className="btn btn-outline-primary" htmlFor="modo-nuevo">
          Cliente nuevo
        </label>
        <input type="radio" className="btn-check" id="modo-existente" value="existente" {...register('modo')} />
        <label className="btn btn-outline-primary" htmlFor="modo-existente">
          Cliente ya registrado
        </label>
      </div>

      {modo === 'nuevo' ? (
        <>
          <CampoForm label="Identificación" error={errors.identificacion?.message}>
            <input className="form-control" {...register('identificacion')} />
          </CampoForm>
          <div className="row">
            <div className="col-md-6">
              <CampoForm label="Nombre" error={errors.nombre?.message}>
                <input className="form-control" {...register('nombre')} />
              </CampoForm>
            </div>
            <div className="col-md-6">
              <CampoForm label="Apellido" error={errors.apellido?.message}>
                <input className="form-control" {...register('apellido')} />
              </CampoForm>
            </div>
          </div>
          <div className="row">
            <div className="col-md-6">
              <CampoForm label="Teléfono" error={errors.telefono?.message}>
                <input className="form-control" {...register('telefono')} />
              </CampoForm>
            </div>
            <div className="col-md-6">
              <CampoForm label="Correo (opcional)" error={errors.email?.message}>
                <input type="email" className="form-control" {...register('email')} />
              </CampoForm>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-3">
          <label className="form-label fw-semibold">Buscar cliente</label>
          <input
            className="form-control"
            placeholder="Nombre, apellido o identificación (mín. 2 letras)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {isFetching && <div className="form-text">Buscando...</div>}
          <div className="list-group mt-2">
            {clientes.map((c) => (
              <button
                type="button"
                key={c.id_cliente}
                className={`list-group-item list-group-item-action ${
                  idCliente === String(c.id_cliente) ? 'active' : ''
                }`}
                onClick={() => setValue('id_cliente', String(c.id_cliente), { shouldValidate: true })}
              >
                {c.nombre} {c.apellido} · {c.identificacion}
              </button>
            ))}
            {q.length >= 2 && !isFetching && clientes.length === 0 && (
              <div className="text-muted small">No se encontraron clientes. Usa "Cliente nuevo".</div>
            )}
          </div>
          {errors.id_cliente && <div className="text-danger small mt-1">{errors.id_cliente.message}</div>}
        </div>
      )}

      <div className="row">
        <div className="col-md-6">
          <CampoForm label="Tipo de vehículo" error={errors.tipo_vehiculo?.message}>
            <select className="form-select" {...register('tipo_vehiculo')}>
              <option value="carro">Carro</option>
              <option value="moto">Moto</option>
              <option value="camion">Camión</option>
            </select>
          </CampoForm>
        </div>
        <div className="col-md-6">
          <CampoForm label="Kilometraje" error={errors.kilometraje?.message}>
            <input type="number" min="0" step="0.1" className="form-control" {...register('kilometraje')} />
          </CampoForm>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-success w-100"
        disabled={registrar.isPending}
        onClick={handleSubmit((d) => {
          setError('');
          registrar.mutate(d);
        })}
      >
        {registrar.isPending ? 'Registrando...' : 'Registrar y usar en la orden'}
      </button>
    </div>
  );
}

function FormCrear({ mecanicos, productos, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [vehiculo, setVehiculo] = useState(null);
  const [sinPlaca, setSinPlaca] = useState('');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(crearSchema),
    defaultValues: {
      id_mecanico: '',
      descripcion: '',
      kilometraje_ingreso: 0,
      tiempo_asignado_min: 60,
      productos: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'productos' });

  const guardar = useMutation({
    mutationFn: (d) =>
      api.post('/ordenes', {
        id_vehiculo: vehiculo.id_vehiculo,
        id_mecanico: Number(d.id_mecanico),
        descripcion: d.descripcion,
        kilometraje_ingreso: d.kilometraje_ingreso,
        tiempo_asignado_min: d.tiempo_asignado_min,
        productos: d.productos.map((p) => ({
          id_producto: Number(p.id_producto),
          cantidad: p.cantidad,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['panel'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] }); // el stock cambió
      onGuardado('Orden creada correctamente');
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(d) {
    if (!vehiculo) {
      setError('Primero busca y selecciona el vehículo por su placa');
      return;
    }
    setError('');
    guardar.mutate(d);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Mensaje tipo="danger">{error}</Mensaje>

      {/* 1. Vehículo */}
      {vehiculo ? (
        <div className="alert alert-success d-flex justify-content-between align-items-start">
          <div>
            <div className="fw-semibold">{vehiculo.placa}</div>
            <div>
              {vehiculo.cliente.nombre} {vehiculo.cliente.apellido}
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setVehiculo(null)}>
            Cambiar
          </button>
        </div>
      ) : sinPlaca ? (
        <RegistroRapido
          placa={sinPlaca}
          onCancelar={() => setSinPlaca('')}
          onRegistrado={(v) => {
            setVehiculo(v);
            setSinPlaca('');
            setError('');
            setValue('kilometraje_ingreso', Number(v.kilometraje));
          }}
        />
      ) : (
        <div className="mb-3">
          <BuscadorPlaca
            textoSeleccionar="Usar este vehículo"
            onSeleccionar={(v) => {
              setVehiculo(v);
              setError('');
              setValue('kilometraje_ingreso', Number(v.kilometraje));
            }}
            onNoEncontrada={(placa) => setSinPlaca(placa)}
          />
        </div>
      )}

      {/* 2. Datos del servicio */}
      <CampoForm label="Mecánico asignado" error={errors.id_mecanico?.message}>
        <select className="form-select" {...register('id_mecanico')}>
          <option value="">Selecciona un mecánico</option>
          {mecanicos.map((m) => (
            <option key={m.id_usuario} value={m.id_usuario}>
              {m.nombre} {m.apellido}
            </option>
          ))}
        </select>
      </CampoForm>

      <CampoForm label="Descripción del servicio" error={errors.descripcion?.message}>
        <textarea className="form-control" rows="2" {...register('descripcion')} />
      </CampoForm>

      <div className="row">
        <div className="col-md-6">
          <CampoForm label="Kilometraje de ingreso" error={errors.kilometraje_ingreso?.message}>
            <input type="number" min="0" step="0.1" className="form-control" {...register('kilometraje_ingreso')} />
          </CampoForm>
        </div>
        <div className="col-md-6">
          <CampoForm label="Tiempo asignado (minutos)" error={errors.tiempo_asignado_min?.message}>
            <input type="number" min="1" className="form-control" {...register('tiempo_asignado_min')} />
          </CampoForm>
        </div>
      </div>

      {/* 3. Productos */}
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <label className="form-label fw-semibold mb-0">Productos de bodega (opcional)</label>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => append({ id_producto: '', cantidad: 1 })}
          >
            Agregar producto
          </button>
        </div>
        {errors.productos?.message && <div className="text-danger small mb-2">{errors.productos.message}</div>}
        {fields.map((f, i) => (
          <div className="row g-2 mb-2 align-items-start" key={f.id}>
            <div className="col-8">
              <select className="form-select" {...register(`productos.${i}.id_producto`)}>
                <option value="">Selecciona un producto</option>
                {productos.map((p) => (
                  <option key={p.id_producto} value={p.id_producto}>
                    {p.nombre_producto} (stock {Number(p.stock)})
                  </option>
                ))}
              </select>
              {errors.productos?.[i]?.id_producto && (
                <div className="text-danger small">{errors.productos[i].id_producto.message}</div>
              )}
            </div>
            <div className="col-3">
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                {...register(`productos.${i}.cantidad`)}
              />
              {errors.productos?.[i]?.cantidad && (
                <div className="text-danger small">{errors.productos[i].cantidad.message}</div>
              )}
            </div>
            <div className="col-1">
              <button
                type="button"
                className="btn btn-outline-danger"
                aria-label="Quitar producto"
                onClick={() => remove(i)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {fields.length === 0 && <div className="form-text">Sin productos: la orden no descuenta inventario.</div>}
      </div>

      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={guardar.isPending}>
          {guardar.isPending ? 'Creando...' : 'Crear orden'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Editar orden (solo pendiente) ---------- */

const editarSchema = z.object({
  id_mecanico: z.string().min(1, 'Selecciona un mecánico'),
  descripcion: z.string().trim().min(1, 'Obligatoria').max(2000),
  tiempo_asignado_min: z.coerce
    .number({ error: 'Debe ser un número' })
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 minuto')
    .max(1440, 'Máximo 1440 minutos'),
});

function FormEditar({ orden, mecanicos, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(editarSchema),
    defaultValues: {
      id_mecanico: String(orden.mecanico.id_usuario),
      descripcion: orden.descripcion,
      tiempo_asignado_min: orden.tiempo_asignado_min,
    },
  });

  const guardar = useMutation({
    mutationFn: (d) =>
      api.put(`/ordenes/${orden.id_orden_servicio}`, { ...d, id_mecanico: Number(d.id_mecanico) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['panel'] });
      onGuardado('Orden actualizada correctamente');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <p className="text-muted">
        Vehículo <strong>{orden.vehiculo.placa}</strong>. Solo se puede modificar mientras esté pendiente.
      </p>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Mecánico asignado" error={errors.id_mecanico?.message}>
        <select className="form-select" {...register('id_mecanico')}>
          {mecanicos.map((m) => (
            <option key={m.id_usuario} value={m.id_usuario}>
              {m.nombre} {m.apellido}
            </option>
          ))}
        </select>
      </CampoForm>
      <CampoForm label="Descripción del servicio" error={errors.descripcion?.message}>
        <textarea className="form-control" rows="2" {...register('descripcion')} />
      </CampoForm>
      <CampoForm label="Tiempo asignado (minutos)" error={errors.tiempo_asignado_min?.message}>
        <input type="number" min="1" className="form-control" {...register('tiempo_asignado_min')} />
      </CampoForm>
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

/* ---------- Anular orden ---------- */

const anularSchema = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo').max(255) });

function FormAnular({ orden, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(anularSchema), defaultValues: { motivo: '' } });

  const anular = useMutation({
    mutationFn: (d) => api.post(`/ordenes/${orden.id_orden_servicio}/anular`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['panel'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      onGuardado('Orden anulada y stock devuelto');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => anular.mutate(d))} noValidate>
      <p>
        ¿Anular la orden del vehículo <strong>{orden.vehiculo.placa}</strong>? Los productos usados volverán
        al inventario.
      </p>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Motivo de la anulación" error={errors.motivo?.message}>
        <input className="form-control" {...register('motivo')} />
      </CampoForm>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Volver
        </button>
        <button className="btn btn-danger" disabled={anular.isPending}>
          {anular.isPending ? 'Anulando...' : 'Anular orden'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Página ---------- */

export default function OrdenesPage() {
  const [estado, setEstado] = useState('');
  const [modal, setModal] = useState({ tipo: null, orden: null }); // 'crear' | 'editar' | 'anular'
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  const { data, isLoading, error } = useQuery({
    queryKey: ['ordenes', estado],
    queryFn: () => api.get(`/ordenes${estado ? `?estado=${estado}` : ''}`),
    refetchInterval: 15000,
  });

  const { data: mecData } = useQuery({
    queryKey: ['mecanicos'],
    queryFn: () => api.get('/usuarios/mecanicos'),
  });
  const { data: prodData } = useQuery({
    queryKey: ['productos', 'lider'],
    queryFn: () => api.get('/productos'),
  });
  const mecanicos = mecData?.mecanicos ?? [];
  const productos = (prodData?.productos ?? []).filter((p) => Number(p.stock) > 0);

  const cerrar = () => setModal({ tipo: null, orden: null });
  const alGuardar = (texto) => {
    cerrar();
    mostrar('success', texto);
  };

  return (
    <>
      <PageHeader titulo="Órdenes de servicio" subtitulo="Crea, consulta y anula las órdenes de tu sede">
        <button className="btn btn-primary" onClick={() => setModal({ tipo: 'crear', orden: null })}>
          Nueva orden
        </button>
      </PageHeader>

      <div className="row g-2 mb-3">
        <div className="col-12 col-md-4">
          <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_TEXTO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
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
                  <th>N.º</th>
                  <th>Vehículo y cliente</th>
                  <th>Servicio</th>
                  <th>Mecánico</th>
                  <th>Tiempo</th>
                  <th>Estado</th>
                  <th className="text-end">Acciones</th>
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
                      {o.detalle_orden_producto.length > 0 && (
                        <div className="text-muted small">
                          {o.detalle_orden_producto
                            .map((d) => `${d.producto.nombre_producto} x${Number(d.cantidad)}`)
                            .join(', ')}
                        </div>
                      )}
                      {o.estado === 'anulada' && o.motivo_anulacion && (
                        <div className="text-danger small">Motivo: {o.motivo_anulacion}</div>
                      )}
                    </td>
                    <td>
                      {o.mecanico.nombre} {o.mecanico.apellido}
                    </td>
                    <td className="text-nowrap">
                      {o.tiempo_asignado_min} min
                      {o.tiempo_real_min != null && (
                        <div className="text-muted small">Real: {o.tiempo_real_min} min</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${ESTADO_BADGE[o.estado]}`}>{ESTADO_TEXTO[o.estado]}</span>
                    </td>
                    <td className="text-end text-nowrap">
                      {o.estado === 'pendiente' && (
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => setModal({ tipo: 'editar', orden: o })}
                        >
                          Editar
                        </button>
                      )}
                      {(o.estado === 'pendiente' || o.estado === 'en_proceso') && (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setModal({ tipo: 'anular', orden: o })}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.ordenes.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center text-muted py-4">
                      No hay órdenes con ese filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal abierto={modal.tipo === 'crear'} titulo="Nueva orden de servicio" onCerrar={cerrar}>
        <FormCrear mecanicos={mecanicos} productos={productos} onGuardado={alGuardar} onCancelar={cerrar} />
      </Modal>

      <Modal abierto={modal.tipo === 'editar'} titulo="Modificar orden" onCerrar={cerrar}>
        {modal.orden && (
          <FormEditar orden={modal.orden} mecanicos={mecanicos} onGuardado={alGuardar} onCancelar={cerrar} />
        )}
      </Modal>

      <Modal abierto={modal.tipo === 'anular'} titulo="Anular orden" onCerrar={cerrar}>
        {modal.orden && <FormAnular orden={modal.orden} onGuardado={alGuardar} onCancelar={cerrar} />}
      </Modal>
    </>
  );
}