import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import CambiarPasswordPage from './pages/auth/CambiarPasswordPage.jsx';
import InicioPage from './pages/InicioPage.jsx';
import Pendiente from './pages/Pendiente.jsx';
import SedesPage from './pages/sedes/SedesPage.jsx';
import UsuariosPage from './pages/usuarios/UsuariosPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RutaProtegida />}>
        <Route path="/cambiar-password" element={<CambiarPasswordPage />} />

        <Route element={<AppLayout />}>
          <Route index element={<InicioPage />} />

          {/* Dev A */}
          <Route element={<RutaProtegida roles={['administrador']} />}>
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/sedes" element={<SedesPage />} />
          </Route>

          {/* Dev B */}
          <Route element={<RutaProtegida roles={['lider_area', 'mecanico']} />}>
            <Route path="/panel" element={<Pendiente titulo="Panel de servicios" />} />
          </Route>
          <Route element={<RutaProtegida roles={['lider_area']} />}>
            <Route path="/ordenes" element={<Pendiente titulo="Órdenes" />} />
          </Route>

          {/* Dev C */}
          <Route element={<RutaProtegida roles={['lider_area']} />}>
            <Route path="/clientes" element={<Pendiente titulo="Clientes y vehículos" />} />
          </Route>
          <Route element={<RutaProtegida roles={['administrador']} />}>
            <Route path="/inventario" element={<Pendiente titulo="Inventario" />} />
            <Route path="/reportes" element={<Pendiente titulo="Reportes" />} />
          </Route>
          <Route element={<RutaProtegida roles={['cajero']} />}>
            <Route path="/cobros" element={<Pendiente titulo="Cobros" />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}