import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { MENU } from '../../config/menu.js';

const ROL_TEXTO = {
  administrador: 'Administrador',
  lider_area: 'Líder de área',
  mecanico: 'Mecánico',
  cajero: 'Cajero',
};

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const items = MENU.filter((i) => i.roles.includes(usuario.rol));

  async function salir() {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark navbar-erp">
        <div className="container-fluid">
          <NavLink className="navbar-brand" to="/">ERP Taller</NavLink>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#menuPrincipal"
            aria-label="Abrir menú"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="menuPrincipal">
            <ul className="navbar-nav me-auto">
              {items.map((i) => (
                <li className="nav-item" key={i.to}>
                  <NavLink className="nav-link" to={i.to}>{i.label}</NavLink>
                </li>
              ))}
            </ul>
            <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 text-white">
              <span className="small">
                {usuario.nombre} {usuario.apellido} · {ROL_TEXTO[usuario.rol]}
              </span>
              <NavLink className="btn btn-outline-light btn-sm" to="/cambiar-password">Contraseña</NavLink>
              <button className="btn btn-light btn-sm" onClick={salir}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="container-fluid container-xl py-4">
        <Outlet />
      </main>
    </>
  );
}