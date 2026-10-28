import { useQuery } from '@tanstack/react-query';

export default function App() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['salud'],
    queryFn: () => fetch('/api/salud').then((r) => r.json()),
    refetchInterval: 10000,
  });

  return (
    <div className="container py-5">
      <h1 className="mb-4">ERP Centro de Mantenimiento</h1>
      {isLoading && <p>Conectando...</p>}
      {error && <div className="alert alert-danger">No hay conexion con el servidor</div>}
      {data && (
        <div className="alert alert-success">
          Conectado a la base de datos. Sedes registradas: {data.sedes}
          <br />
          Ultima actualizacion: {new Date(data.ahora).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}