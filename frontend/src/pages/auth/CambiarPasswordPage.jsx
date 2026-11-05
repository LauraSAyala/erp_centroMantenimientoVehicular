import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';

const schema = z
  .object({
    passwordActual: z.string().min(1, 'Obligatoria'),
    passwordNueva: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.passwordNueva === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  });

export default function CambiarPasswordPage() {
  const { usuario, marcarPasswordCambiada } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit({ passwordActual, passwordNueva }) {
    setError('');
    try {
      await api.post('/auth/cambiar-password', { passwordActual, passwordNueva });
      marcarPasswordCambiada();
      navigate('/');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="container d-flex align-items-center justify-content-center min-vh-100">
      <div className="card p-4 w-100" style={{ maxWidth: 420 }}>
        <h1 className="h4 mb-1">Cambiar contraseña</h1>
        {usuario.debe_cambiar_password && (
          <p className="text-muted">Debes cambiar tu contraseña antes de continuar.</p>
        )}
        <Mensaje tipo="danger">{error}</Mensaje>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CampoForm label="Contraseña actual" error={errors.passwordActual?.message}>
            <input type="password" className="form-control" {...register('passwordActual')} />
          </CampoForm>
          <CampoForm label="Contraseña nueva" error={errors.passwordNueva?.message}>
            <input type="password" className="form-control" {...register('passwordNueva')} />
          </CampoForm>
          <CampoForm label="Confirmar contraseña nueva" error={errors.confirmar?.message}>
            <input type="password" className="form-control" {...register('confirmar')} />
          </CampoForm>
          <button className="btn btn-primary w-100" disabled={isSubmitting}>Guardar</button>
        </form>
      </div>
    </div>
  );
}