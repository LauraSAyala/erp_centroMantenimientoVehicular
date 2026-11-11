import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useDebounce } from '../hooks/useDebounce.js';

const TIPO_TEXTO = { carro: 'Carro', moto: 'Moto', camion: 'Camión' };

export function normalizarPlaca(p) {
  return String(p ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Props:
 *  - onSeleccionar(vehiculo): se llama al pulsar "Usar este vehículo"
 *  - onNoEncontrada(placa):   se llama al pulsar "Registrar placa nueva"
 *  - textoSeleccionar:        texto del botón de selección (opcional)
 */
export default function BuscadorPlaca({
  onSeleccionar,
  onNoEncontrada,
  textoSeleccionar = 'Usar este vehículo',
}) {
  const [texto, setTexto] = useState('');
  const placa = useDebounce(normalizarPlaca(texto), 400);
  const buscar = placa.length >= 5;

  const { data, error, isFetching } = useQuery({
    queryKey: ['vehiculo-placa', placa],
    queryFn: () => api.get(`/vehiculos/placa/${placa}`),
    enabled: buscar,
    staleTime: 0,
  });

  const vehiculo = buscar ? data?.vehiculo : null;
  const noEncontrada = buscar && error?.status === 404;
  const otroError = buscar && error && error.status !== 404 ? error.message : '';

  return (
    <div>
      <label className="form-label fw-semibold">Placa del vehículo</label>
      <input
        className="form-control text-uppercase"
        placeholder="Ej: ABC123"
        maxLength={10}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoComplete="off"
      />

      {isFetching && <div className="form-text">Buscando...</div>}
      {otroError && <div className="text-danger small mt-1">{otroError}</div>}

      {vehiculo && (
        <div className="alert alert-success mt-2 mb-0">
          <div className="fw-semibold">
            {vehiculo.placa} · {TIPO_TEXTO[vehiculo.tipo_vehiculo]} ·{' '}
            {Number(vehiculo.kilometraje).toLocaleString('es-CO')} km
          </div>
          <div>
            Cliente: {vehiculo.cliente.nombre} {vehiculo.cliente.apellido} (
            {vehiculo.cliente.identificacion})
          </div>
          {onSeleccionar && (
            <button
              type="button"
              className="btn btn-sm btn-success mt-2"
              onClick={() => onSeleccionar(vehiculo)}
            >
              {textoSeleccionar}
            </button>
          )}
        </div>
      )}

      {noEncontrada && (
        <div className="alert alert-warning mt-2 mb-0">
          La placa <strong>{placa}</strong> no está registrada.
          {onNoEncontrada && (
            <div>
              <button
                type="button"
                className="btn btn-sm btn-outline-dark mt-2"
                onClick={() => onNoEncontrada(placa)}
              >
                Registrar placa nueva
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}