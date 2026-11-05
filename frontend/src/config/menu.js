export const MENU = [
  // Dev A
  { label: 'Usuarios', to: '/usuarios', roles: ['administrador'] },
  { label: 'Sedes', to: '/sedes', roles: ['administrador'] },

  // Dev B
  { label: 'Panel de servicios', to: '/panel', roles: ['lider_area', 'mecanico'] },
  { label: 'Órdenes', to: '/ordenes', roles: ['lider_area'] },

  // Dev C
  { label: 'Clientes y vehículos', to: '/clientes', roles: ['lider_area'] },
  { label: 'Inventario', to: '/inventario', roles: ['administrador'] },
  { label: 'Cobros', to: '/cobros', roles: ['cajero'] },
  { label: 'Reportes', to: '/reportes', roles: ['administrador'] },
];