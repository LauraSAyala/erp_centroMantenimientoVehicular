export function manejarErrores(err, req, res, next) {
  // Cuerpo JSON mal formado enviado por el cliente
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ ok: false, mensaje: 'El cuerpo de la petición no es un JSON válido' });
  }
  // Reglas de negocio (stock insuficiente, estado inválido, etc.)
  if (err.name === 'StockError' || err.name === 'ReglaError') {
    return res.status(err.status).json({ ok: false, mensaje: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}