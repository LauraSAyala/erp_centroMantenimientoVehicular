import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Cargando from '../../components/ui/Cargando.jsx';
import Mensaje from '../../components/ui/Mensaje.jsx';

const UMBRAL_SEG = 300; // 5 minutos (RF-06)
const TIPO_TEXTO = { carro: 'Carro', moto: 'Moto', camion: 'Camión' };

function formatoTiempo(seg) {
  const negativo = seg < 0;
  const s = Math.abs(seg);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${negativo ? '-' : ''}${mm}:${ss}`;
}

// Calcula restante y estado con la hora (corregida) del servidor
function calcular(o, ahoraMs) {
  const asignado = o.tiempo_asignado_min * 60;
  if (o.estado !== 'en_proceso' || !o.hora_inicio) {
    return { restante: asignado, estadoTiempo: 'sin_iniciar' };
  }
  const transcurrido = Math.floor((ahoraMs - new Date(o.hora_inicio).getTime()) / 1000);
  const restante = asignado - transcurrido;
  const estadoTiempo =
    restante <= 0 ? 'retrasada' : restante <= UMBRAL_SEG ? 'por_vencer' : 'a_tiempo';
  return { restante, estadoTiempo };
}

const COLOR = {
  a_tiempo: 'var(--estado-a-tiempo)',
  por_vencer: 'var(--estado-por-vencer)',
  retrasada: 'var(--estado-retrasada)',
  sin_iniciar: 'var(--bs-secondary)',
};

const ETIQUETA = {
  a_tiempo: 'A tiempo',
  por_vencer: 'Por vencer',
  retrasada: 'Retrasada',
  sin_iniciar: 'Sin iniciar',
};

export default function PanelPage() {
  const { usuario: yo } = useAuth();
  const queryClient = useQueryClient();
  const [aviso, setAviso] = useState(null);
  const mostrar = (tipo, texto) => setAviso({ tipo, texto, id: Date.now() });

  // Polling cada 10 s (RF-03)
  const { data, isLoading, error } = useQuery({
    queryKey: ['panel'],
    queryFn: () => api.get('/ordenes/panel'),
    refetchInterval: 10000,
  });

  // Diferencia entre el reloj del servidor y el de este equipo
  const offset = useMemo(
    () => (data ? new Date(data.ahora).getTime() - Date.now() : 0),
    [data]
  );

  // Reloj que avanza cada segundo
  const [reloj, setReloj] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setReloj(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ahoraMs = reloj + offset;

  const ordenes = useMemo(() => {
    if (!data) return [];
    return data.ordenes
      .map((o) => ({ ...o, ...calcular(o, ahoraMs) }))
      .sort((a, b) => a.restante - b.restante);
  }, [data, ahoraMs]);

  const retrasadas = ordenes.filter((o) => o.estadoTiempo === 'retrasada');
  const porVencer = ordenes.filter((o) => o.estadoTiempo === 'por_vencer');

  const accion = useMutation({
    mutationFn: ({ id, tipo }) => api.post(`/ordenes/${id}/${tipo}`),
    onSuccess: (_r, { tipo }) => {
      mostrar('success', tipo === 'iniciar' ? 'Orden iniciada' : 'Orden finalizada');
      queryClient.invalidateQueries({ queryKey: ['panel'] });
    },
    onError: (e) => {
      mostrar('danger', e.message);
      queryClient.invalidateQueries({ queryKey: ['panel'] });
    },
  });

  function finalizar(o) {
    if (window.confirm(`¿Finalizar la orden del vehículo ${o.vehiculo.placa}?`)) {
      accion.mutate({ id: o.id_orden_servicio, tipo: 'finalizar' });
    }
  }

  const etiquetaOrden = (o) =>
    `${o.vehiculo.placa} (${o.mecanico.nombre} ${o.mecanico.apellido}, ${o.descripcion})`;

  return (
    <>
      <PageHeader titulo="Panel de servicios" subtitulo="Órdenes activas de tu sede, de menor a mayor tiempo restante" />

      {/* Alertas permanentes (RF-06): no desaparecen solas */}
      {retrasadas.length > 0 && (
        <Mensaje tipo="danger" duracion={0}>
          <strong>Tiempo agotado:</strong>{' '}
          {retrasadas.map((o) => etiquetaOrden(o)).join(' · ')}
        </Mensaje>
      )}
      {porVencer.length > 0 && (
        <Mensaje tipo="warning" duracion={0}>
          <strong>Por vencer (5 min o menos):</strong>{' '}
          {porVencer.map((o) => etiquetaOrden(o)).join(' · ')}
        </Mensaje>
      )}

      {aviso && (
        <Mensaje key={aviso.id} tipo={aviso.tipo}>
          {aviso.texto}
        </Mensaje>
      )}
      <Mensaje tipo="danger">{error?.message}</Mensaje>
      {isLoading && <Cargando />}

      {data && ordenes.length === 0 && (
        <div className="alert alert-secondary">No hay órdenes activas en tu sede.</div>
      )}

      <div className="row g-3">
        {ordenes.map((o) => {
          const esMia = yo.rol === 'mecanico' && o.mecanico.id_usuario === yo.id_usuario;
          const procesando =
            accion.isPending && accion.variables?.id === o.id_orden_servicio;
          return (
            <div className="col-12 col-md-6 col-xl-4" key={o.id_orden_servicio}>
              <div
                className="card h-100 p-3"
                style={{ borderLeft: `6px solid ${COLOR[o.estadoTiempo]}` }}
              >
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="h5 mb-0">{o.vehiculo.placa}</div>
                    <div className="text-muted small">{TIPO_TEXTO[o.vehiculo.tipo_vehiculo]}</div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: COLOR[o.estadoTiempo],
                      color: o.estadoTiempo === 'por_vencer' ? '#000' : '#fff',
                    }}
                  >
                    {ETIQUETA[o.estadoTiempo]}
                  </span>
                </div>

                <div className="display-6 my-2" style={{ color: COLOR[o.estadoTiempo] }}>
                  {formatoTiempo(o.restante)}
                </div>
                <div className="text-muted small mb-2">
                  Tiempo asignado: {o.tiempo_asignado_min} min
                  {o.estado === 'pendiente' && ' · aún no iniciada'}
                </div>

                <div>{o.descripcion}</div>
                <div className="text-muted small mt-2">
                  Cliente: {o.cliente.nombre} {o.cliente.apellido}
                  <br />
                  Mecánico: {o.mecanico.nombre} {o.mecanico.apellido}
                </div>

                {esMia && (
                  <div className="mt-3">
                    {o.estado === 'pendiente' && (
                      <button
                        className="btn btn-primary w-100"
                        disabled={procesando}
                        onClick={() => accion.mutate({ id: o.id_orden_servicio, tipo: 'iniciar' })}
                      >
                        {procesando ? 'Iniciando...' : 'Iniciar servicio'}
                      </button>
                    )}
                    {o.estado === 'en_proceso' && (
                      <button
                        className="btn btn-success w-100"
                        disabled={procesando}
                        onClick={() => finalizar(o)}
                      >
                        {procesando ? 'Finalizando...' : 'Finalizar servicio'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}