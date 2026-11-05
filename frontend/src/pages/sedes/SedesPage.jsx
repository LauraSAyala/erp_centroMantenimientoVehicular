import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Modal from '../../components/ui/Modal.jsx';

const schema = z.object({
  ciudad: z.string().trim().min(1, 'Obligatoria').max(80),
  direccion: z.string().trim().min(1, 'Obligatoria').max(150),
  telefono: z.string().trim().max(20).optional(),
});

function FormSede({ sede, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      ciudad: sede?.ciudad ?? '',
      direccion: sede?.direccion ?? '',
      telefono: sede?.telefono ?? '',
    },
  });

  const guardar = useMutation({
    mutationFn: (datos) =>
      sede ? api.put(`/sedes/${sede.id_sede}`, datos) : api.post('/sedes', datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sedes'] });
      onGuardado();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Ciudad" error={errors.ciudad?.message}>
        <input className="form-control" {...register('ciudad')} />
      </CampoForm>
      <CampoForm label="Dirección" error={errors.direccion?.message}>
        <input className="form-control" {...register('direccion')} />
      </CampoForm>
      <CampoForm label="Teléfono" error={errors.telefono?.message}>
        <input className="form-control" {...register('telefono')} />
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

export default function SedesPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState({ abierto: false, sede: null });
  const [errorEstado, setErrorEstado] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => api.get('/sedes'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activo }) => api.patch(`/sedes/${id}/estado`, { activo }),
    onSuccess: () => {
      setErrorEstado('');
      queryClient.invalidateQueries({ queryKey: ['sedes'] });
    },
    onError: (e) => setErrorEstado(e.message),
  });

  const cerrar = () => setModal({ abierto: false, sede: null });

  return (
    <>
      <PageHeader titulo="Sedes" subtitulo="Administra las sedes del centro de mantenimiento">
        <button className="btn btn-primary" onClick={() => setModal({ abierto: true, sede: null })}>
          Nueva sede
        </button>
      </PageHeader>

      <Mensaje tipo="danger">{errorEstado || error?.message}</Mensaje>
      {isLoading && <Cargando />}

      {data && (
        <div className="card">
          <div className="tabla-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Ciudad</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Usuarios</th>
                  <th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.sedes.map((s) => (
                  <tr key={s.id_sede}>
                    <td>{s.ciudad}</td>
                    <td>{s.direccion}</td>
                    <td>{s.telefono || '—'}</td>
                    <td>{s._count.usuario}</td>
                    <td>
                      <span className={`badge ${s.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>
                        {s.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="text-end text-nowrap">
                      <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => setModal({ abierto: true, sede: s })}
                      >
                        Editar
                      </button>
                      <button
                        className={`btn btn-sm ${s.activo ? 'btn-outline-danger' : 'btn-outline-success'}`}
                        onClick={() => cambiarEstado.mutate({ id: s.id_sede, activo: !s.activo })}
                      >
                        {s.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.sedes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-4">
                      No hay sedes registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        abierto={modal.abierto}
        titulo={modal.sede ? 'Editar sede' : 'Nueva sede'}
        onCerrar={cerrar}
      >
        <FormSede sede={modal.sede} onGuardado={cerrar} onCancelar={cerrar} />
      </Modal>
    </>
  );
}