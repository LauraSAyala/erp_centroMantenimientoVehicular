import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Cargando from './ui/Cargando.jsx';

export default function RutaProtegida({ roles }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/login" replace />;

  if (usuario.debe_cambiar_password && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="container py-5 text-center">
        <h2>Acceso denegado</h2>
        <p className="text-muted">No tienes permisos para ver esta página.</p>
      </div>
    );
  }

  return <Outlet />;
}