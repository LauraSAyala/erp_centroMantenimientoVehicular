export function manejarErrores(err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}