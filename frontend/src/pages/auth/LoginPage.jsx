import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import CampoForm from '../../components/ui/CampoForm.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';

const schema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export default function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [errorServidor, setErrorServidor] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  if (usuario) return <Navigate to="/" replace />;

  async function onSubmit({ email, password }) {
    setErrorServidor('');
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setErrorServidor(e.message);
    }
  }

  return (
    <div className="container d-flex align-items-center justify-content-center min-vh-100">
      <div className="card p-4 w-100" style={{ maxWidth: 400 }}>
        <h1 className="h4 text-center mb-1">ERP Centro de Mantenimiento</h1>
        <p className="text-muted text-center mb-4">Inicia sesión para continuar</p>

        <Mensaje tipo="danger">{errorServidor}</Mensaje>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CampoForm label="Correo" error={errors.email?.message}>
            <input type="email" className="form-control" autoComplete="username" {...register('email')} />
          </CampoForm>
          <CampoForm label="Contraseña" error={errors.password?.message}>
            <input type="password" className="form-control" autoComplete="current-password" {...register('password')} />
          </CampoForm>
          <button className="btn btn-primary w-100" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}