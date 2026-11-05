export default function Cargando({ texto = 'Cargando...' }) {
  return (
    <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
      <div className="spinner-border spinner-border-sm" role="status" />
      <span>{texto}</span>
    </div>
  );
}