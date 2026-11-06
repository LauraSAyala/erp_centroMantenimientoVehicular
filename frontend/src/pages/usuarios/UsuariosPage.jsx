import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Modal from '../../components/ui/Modal.jsx';

const ROL_TEXTO = {
  administrador: 'Administrador',
  lider_area: 'Líder de área',
  mecanico: 'Mecánico',
  cajero: 'Cajero',
};

const baseSchema = z.object({
  nombre: z.string().trim().min(1, 'Obligatorio').max(80),
  apellido: z.string().trim().min(1, 'Obligatorio').max(80),
  identificacion: z.string().trim().min(1, 'Obligatoria').max(20),
  email: z.email('Correo inválido').max(120),
  telefono: z.string().trim().max(20).optional(),
  rol: z.enum(['administrador', 'lider_area', 'mecanico', 'cajero']),
  id_sede: z.string().optional(),
  password: z.string().optional(),
});

function crearSchema(esNuevo) {
  return baseSchema.superRefine((d, ctx) => {
    if (d.rol !== 'administrador' && !d.id_sede) {
      ctx.addIssue({
        code: 'custom',
        path: ['id_sede'],
        message: 'La sede es obligatoria para este rol',
      });
    }
    if (esNuevo && (!d.password || d.password.length < 8)) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Mínimo 8 caracteres' });
    }
  });
}

function FormUsuario({ usuario, sedes, onGuardado, onCancelar }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const esNuevo = !usuario;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(crearSchema(esNuevo)),
    defaultValues: {
      nombre: usuario?.nombre ?? '',
      apellido: usuario?.apellido ?? '',
      identificacion: usuario?.identificacion ?? '',
      email: usuario?.email ?? '',
      telefono: usuario?.telefono ?? '',
      rol: usuario?.rol ?? 'mecanico',
      id_sede: usuario?.id_sede ? String(usuario.id_sede) : '',
      password: '',
    },
  });

  const rol = useWatch({ control, name: 'rol' });

  const guardar = useMutation({
    mutationFn: (d) => {
      const cuerpo = {
        nombre: d.nombre,
        apellido: d.apellido,
        identificacion: d.identificacion,
        email: d.email,
        telefono: d.telefono || null,
        rol: d.rol,
        id_sede: d.rol === 'administrador' || !d.id_sede ? null : Number(d.id_sede),
      };
      return esNuevo
        ? api.post('/usuarios', { ...cuerpo, password: d.password })
        : api.put(`/usuarios/${usuario.id_usuario}`, cuerpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] }); // sin await
      onGuardado(esNuevo ? 'Usuario creado correctamente' : 'Usuario actualizado correctamente');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <Mensaje tipo="danger">{error}</Mensaje>

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
          <CampoForm label="Identificación" error={errors.identificacion?.message}>
            <input className="form-control" {...register('identificacion')} />
          </CampoForm>
        </div>
        <div className="col-md-6">
          <CampoForm label="Teléfono" error={errors.telefono?.message}>
            <input className="form-control" {...register('telefono')} />
          </CampoForm>
        </div>
      </div>

      <CampoForm label="Correo" error={errors.email?.message}>
        <input type="email" className="form-control" {...register('email')} />
      </CampoForm>

      <div className="row">
        <div className="col-md-6">
          <CampoForm label="Rol" error={errors.rol?.message}>
            <select className="form-select" {...register('rol')}>
              {Object.entries(ROL_TEXTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </CampoForm>
        </div>
        <div className="col-md-6">
          <CampoForm label="Sede" error={errors.id_sede?.message}>
            <select
              className="form-select"
              disabled={rol === 'administrador'}
              {...register('id_sede')}
            >
              <option value="">
                {rol === 'administrador' ? 'No aplica' : 'Selecciona una sede'}
              </option>
              {sedes.map((s) => (
                <option key={s.id_sede} value={s.id_sede}>
                  {s.ciudad} - {s.direccion}
                </option>
              ))}
            </select>
          </CampoForm>
        </div>
      </div>

      {esNuevo && (
        <CampoForm label="Contraseña temporal" error={errors.password?.message}>
          <input type="text" className="form-control" autoComplete="off" {...register('password')} />
          <div className="form-text">El usuario deberá cambiarla en su primer ingreso.</div>
        </CampoForm>
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

const resetSchema = z.object({ password: z.string().min(8, 'Mínimo 8 caracteres') });

function FormReset({ usuario, onGuardado, onCancelar }) {
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '' } });

  const guardar = useMutation({
    mutationFn: (d) => api.post(`/usuarios/${usuario.id_usuario}/restablecer-password`, d),
    onSuccess: onGuardado,
    onError: (e) => setError(e.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} noValidate>
      <p className="text-muted">
        Define una contraseña temporal para{' '}
        <strong>
          {usuario.nombre} {usuario.apellido}
        </strong>
        . Deberá cambiarla al iniciar sesión.
      </p>
      <Mensaje tipo="danger">{error}</Mensaje>
      <CampoForm label="Contraseña temporal" error={errors.password?.message}>
        <input type="text" className="form-control" autoComplete="off" {...register('password')} />
      </CampoForm>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando...' : 'Restablecer'}
        </button>
      </div>
    </form>
  );
}

export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ rol: '', id_sede: '' });
  const [modal, setModal] = useState({ tipo: null, usuario: null }); // tipo: 'form' | 'reset'
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => api.get('/sedes'),
  });
  const sedesActivas = (sedesData?.sedes ?? []).filter((s) => s.activo);

  const params = new URLSearchParams();
  if (filtros.rol) params.set('rol', filtros.rol);
  if (filtros.id_sede) params.set('id_sede', filtros.id_sede);
  const qs = params.toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ['usuarios', filtros],
    queryFn: () => api.get(`/usuarios${qs ? `?${qs}` : ''}`),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activo }) => api.patch(`/usuarios/${id}/estado`, { activo }),

    onMutate: async ({ id, activo }) => {
      setAviso(null);
      await queryClient.cancelQueries({ queryKey: ['usuarios'] });
      const anteriores = queryClient.getQueriesData({ queryKey: ['usuarios'] });
      queryClient.setQueriesData({ queryKey: ['usuarios'] }, (datos) =>
        datos
          ? {
              ...datos,
              usuarios: datos.usuarios.map((u) => (u.id_usuario === id ? { ...u, activo } : u)),
            }
          : datos
      );
      return { anteriores };
    },

    onSuccess: (_r, { activo }) => {
      mostrar(
        'success',
        activo ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente'
      );
      // El conteo de usuarios activos de las sedes cambió
      queryClient.invalidateQueries({ queryKey: ['sedes'] });
    },

    onError: (e, _vars, contexto) => {
      contexto.anteriores.forEach(([clave, datos]) => queryClient.setQueryData(clave, datos));
      mostrar('danger', e.message);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  const cerrar = () => setModal({ tipo: null, usuario: null });

  return (
    <>
      <PageHeader titulo="Usuarios" subtitulo="Administra los usuarios, sus roles y sedes">
        <button
          className="btn btn-primary"
          onClick={() => setModal({ tipo: 'form', usuario: null })}
        >
          Nuevo usuario
        </button>
      </PageHeader>

      <div className="row g-2 mb-3">
        <div className="col-12 col-md-4">
          <select
            className="form-select"
            value={filtros.rol}
            onChange={(e) => setFiltros({ ...filtros, rol: e.target.value })}
          >
            <option value="">Todos los roles</option>
            {Object.entries(ROL_TEXTO).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
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
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.usuarios.map((u) => {
                  const procesando =
                    cambiarEstado.isPending && cambiarEstado.variables?.id === u.id_usuario;
                  return (
                    <tr key={u.id_usuario}>
                      <td>
                        {u.nombre} {u.apellido}
                        <div className="text-muted small">{u.identificacion}</div>
                      </td>
                      <td>{u.email}</td>
                      <td>{ROL_TEXTO[u.rol]}</td>
                      <td>{u.sede ? `${u.sede.ciudad} - ${u.sede.direccion}` : '—'}</td>
                      <td>
                        <span
                          className={`badge ${u.activo ? 'text-bg-success' : 'text-bg-secondary'}`}
                        >
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => setModal({ tipo: 'form', usuario: u })}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => {
                            setAviso(null);
                            setModal({ tipo: 'reset', usuario: u });
                          }}
                        >
                          Contraseña
                        </button>
                        <button
                          className={`btn btn-sm ${
                            u.activo ? 'btn-outline-danger' : 'btn-outline-success'
                          }`}
                          disabled={u.id_usuario === yo.id_usuario || procesando}
                          onClick={() =>
                            cambiarEstado.mutate({ id: u.id_usuario, activo: !u.activo })
                          }
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {data.usuarios.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-4">
                      No hay usuarios con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        abierto={modal.tipo === 'form'}
        titulo={modal.usuario ? 'Editar usuario' : 'Nuevo usuario'}
        onCerrar={cerrar}
      >
        <FormUsuario
          usuario={modal.usuario}
          sedes={sedesActivas}
          onGuardado={(texto) => {
            cerrar();
            mostrar('success', texto);
            queryClient.invalidateQueries({ queryKey: ['sedes'] });
          }}
          onCancelar={cerrar}
        />
      </Modal>

      <Modal abierto={modal.tipo === 'reset'} titulo="Restablecer contraseña" onCerrar={cerrar}>
        {modal.usuario && (
          <FormReset
            usuario={modal.usuario}
            onGuardado={() => {
              cerrar();
              mostrar('success', 'Contraseña restablecida. El usuario deberá cambiarla al ingresar.');
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>
    </>
  );
}