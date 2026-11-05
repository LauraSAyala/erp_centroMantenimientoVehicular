import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const { data: usuario, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.usuario).catch(() => null),
    staleTime: Infinity,
  });

  async function login(email, password) {
    const r = await api.post('/auth/login', { email, password });
    queryClient.setQueryData(['me'], r.usuario);
    return r.usuario;
  }

  async function logout() {
    await api.post('/auth/logout');
    queryClient.setQueryData(['me'], null);
    queryClient.clear();
  }

  function marcarPasswordCambiada() {
    queryClient.setQueryData(['me'], (u) => ({ ...u, debe_cambiar_password: false }));
  }

  return (
    <AuthContext.Provider
      value={{ usuario: usuario ?? null, cargando: isLoading, login, logout, marcarPasswordCambiada }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}