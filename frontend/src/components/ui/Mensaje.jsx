import { useEffect, useState } from 'react';

// tipo: success | danger | warning | info
// duracion: milisegundos antes de ocultarse (0 = permanente)
export default function Mensaje({ tipo = 'info', duracion, children }) {
  const [visible, setVisible] = useState(true);

  // Por defecto: éxito se oculta a los 4 s, error a los 6 s, el resto es permanente
  const tiempo = duracion ?? (tipo === 'success' ? 4000 : tipo === 'danger' ? 6000 : 0);

  useEffect(() => {
    if (!children) return;
    setVisible(true);
    if (!tiempo) return;
    const t = setTimeout(() => setVisible(false), tiempo);
    return () => clearTimeout(t);
  }, [children, tiempo]);

  if (!children || !visible) return null;
  return (
    <div className={`alert alert-${tipo} py-2`} role="alert">
      {children}
    </div>
  );
}