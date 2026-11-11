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
import BuscadorPlaca from '../../components/BuscadorPlaca.jsx';

const TIPO_TEXTO = { carro: 'Carro', moto: 'Moto', camion: 'Camión' };

/* ---------- Formulario de cliente ---------- */

const clienteSchema = z.object({
  identificacion: z.string().trim().min(1, 'Obligatoria').max(20),
  nombre: z.string().trim().min(1, 'Obligatorio').max(80),
  apellido: z.string().trim().min(1, 'Obligatorio').max(80),
  telefono: z.string().trim().max(20).optional(),
  email: z.union([z.email('Correo inválido').max(120), z.literal('')]).optional(),
});

function FormCliente({ cliente, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const esNuevo = !cliente;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      identificacion: cliente?.identificacion ?? '',
      nombre: cliente?.nombre ?? '',
      apellido: cliente?.apellido ?? '',
      telefono: cliente?.telefono ?? '',
      email: cliente?.email ?? '',
    },
  });

  const guardar = useMutation({
    mutationFn: (d) =>
      esNuevo ? api.post('/clientes', d) : api.put(`/clientes/${cliente.id_cliente}`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      onGuardado(esNuevo ? 'Cliente creado correctamente' : 'Cliente actualizado correctamente');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <Mensaje tipo="danger">{error}</Mensaje>
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

/* ---------- Formulario de vehículo ---------- */

const vehiculoSchema = z.object({
  placa: z
    .string()
    .transform((p) => p.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^[A-Z0-9]{5,8}$/, 'Placa inválida (5 a 8 letras o números)')),
  tipo_vehiculo: z.enum(['carro', 'moto', 'camion']),
  kilometraje: z.coerce.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativo'),
});

function FormVehiculo({ cliente, vehiculo, placaInicial, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const esNuevo = !vehiculo;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(vehiculoSchema),
    defaultValues: {
      placa: vehiculo?.placa ?? placaInicial ?? '',
      tipo_vehiculo: vehiculo?.tipo_vehiculo ?? 'carro',
      kilometraje: vehiculo ? Number(vehiculo.kilometraje) : 0,
    },
  });

  const guardar = useMutation({
    mutationFn: (d) => {
      const cuerpo = { ...d, id_cliente: cliente.id_cliente };
      return esNuevo
        ? api.post('/vehiculos', cuerpo)
        : api.put(`/vehiculos/${vehiculo.id_vehiculo}`, cuerpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['vehiculo-placa'] });
      onGuardado(
        esNuevo ? 'Vehículo registrado correctamente' : 'Vehículo actualizado correctamente'
      );
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <p className="text-muted">
        Cliente:{' '}
        <strong>
          {cliente.nombre} {cliente.apellido}
        </strong>
      </p>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Placa" error={errors.placa?.message}>
        <input className="form-control text-uppercase" {...register('placa')} />
      </CampoForm>
      <div className="row">
        <div className="col-md-6">
          <CampoForm label="Tipo de vehículo" error={errors.tipo_vehiculo?.message}>
            <select className="form-select" {...register('tipo_vehiculo')}>
              {Object.entries(TIPO_TEXTO).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </CampoForm>
        </div>
        <div className="col-md-6">
          <CampoForm label="Kilometraje" error={errors.kilometraje?.message}>
            <input
              type="number"
              min="0"
              step="0.1"
              className="form-control"
              {...register('kilometraje')}
            />
          </CampoForm>
        </div>
      </div>
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

/* ---------- Página ---------- */

export default function ClientesPage() {
  const [busqueda, setBusqueda] = useState('');
  const q = useDebounce(busqueda.trim(), 400);
  // tipo: 'cliente' | 'vehiculo' | 'elegirCliente'
  const [modal, setModal] = useState({ tipo: null, cliente: null, vehiculo: null, placa: '' });
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['clientes', q],
    queryFn: () => api.get(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: (anterior) => anterior,
  });

  const cerrar = () => setModal({ tipo: null, cliente: null, vehiculo: null, placa: '' });

  return (
    <>
      <PageHeader titulo="Clientes y vehículos" subtitulo="Registra y consulta clientes y sus vehículos">
        <button
          className="btn btn-primary"
          onClick={() => setModal({ tipo: 'cliente', cliente: null, vehiculo: null, placa: '' })}
        >
          Nuevo cliente
        </button>
      </PageHeader>

      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <label className="form-label fw-semibold">Buscar cliente</label>
            <input
              className="form-control"
              placeholder="Nombre, apellido o identificación"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {isFetching && <div className="form-text">Buscando...</div>}
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <BuscadorPlaca
              textoSeleccionar="Ver cliente"
              onSeleccionar={(v) => setBusqueda(v.cliente.identificacion)}
              onNoEncontrada={(placa) =>
                setModal({ tipo: 'elegirCliente', cliente: null, vehiculo: null, placa })
              }
            />
          </div>
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
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Vehículos</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c) => (
                  <tr key={c.id_cliente}>
                    <td>
                      {c.nombre} {c.apellido}
                      <div className="text-muted small">{c.identificacion}</div>
                    </td>
                    <td>
                      {c.telefono || '—'}
                      <div className="text-muted small">{c.email || ''}</div>
                    </td>
                    <td>
                      {c.vehiculo.length === 0 && <span className="text-muted">Sin vehículos</span>}
                      <div className="d-flex flex-wrap gap-1">
                        {c.vehiculo.map((v) => (
                          <button
                            key={v.id_vehiculo}
                            className="btn btn-sm btn-outline-secondary"
                            title="Editar vehículo"
                            onClick={() =>
                              setModal({ tipo: 'vehiculo', cliente: c, vehiculo: v, placa: '' })
                            }
                          >
                            {v.placa} · {TIPO_TEXTO[v.tipo_vehiculo]} ·{' '}
                            {Number(v.kilometraje).toLocaleString('es-CO')} km
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="text-end text-nowrap">
                      <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() =>
                          setModal({ tipo: 'cliente', cliente: c, vehiculo: null, placa: '' })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() =>
                          setModal({ tipo: 'vehiculo', cliente: c, vehiculo: null, placa: '' })
                        }
                      >
                        Agregar vehículo
                      </button>
                    </td>
                  </tr>
                ))}
                {data.clientes.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center text-muted py-4">
                      No se encontraron clientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        abierto={modal.tipo === 'cliente'}
        titulo={modal.cliente ? 'Editar cliente' : 'Nuevo cliente'}
        onCerrar={cerrar}
      >
        <FormCliente
          cliente={modal.cliente}
          onGuardado={(t) => {
            cerrar();
            mostrar('success', t);
          }}
          onCancelar={cerrar}
        />
      </Modal>

      <Modal
        abierto={modal.tipo === 'vehiculo'}
        titulo={modal.vehiculo ? 'Editar vehículo' : 'Nuevo vehículo'}
        onCerrar={cerrar}
      >
        {modal.cliente && (
          <FormVehiculo
            cliente={modal.cliente}
            vehiculo={modal.vehiculo}
            placaInicial={modal.placa}
            onGuardado={(t) => {
              cerrar();
              mostrar('success', t);
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>

      {/* Placa no registrada: elegir a qué cliente pertenece */}
      <Modal
        abierto={modal.tipo === 'elegirCliente'}
        titulo={`Registrar placa ${modal.placa}`}
        onCerrar={cerrar}
      >
        <p>
          Busca al cliente en la tabla de arriba y pulsa <strong>Agregar vehículo</strong>, o crea un
          cliente nuevo si aún no existe.
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-outline-secondary" onClick={cerrar}>
            Cerrar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setModal({ tipo: 'cliente', cliente: null, vehiculo: null, placa: '' })}
          >
            Crear cliente nuevo
          </button>
        </div>
      </Modal>
    </>
  );
}