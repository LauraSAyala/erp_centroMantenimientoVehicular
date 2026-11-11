// Error de regla de negocio: se responde con su status y mensaje
export class ReglaError extends Error {
  constructor(mensaje, status = 409) {
    super(mensaje);
    this.name = 'ReglaError';
    this.status = status;
  }
}