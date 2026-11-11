import { useEffect, useState } from 'react';

// Devuelve el valor solo después de que deja de cambiar durante `retraso` ms
export function useDebounce(valor, retraso = 400) {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), retraso);
    return () => clearTimeout(t);
  }, [valor, retraso]);
  return debounced;
}