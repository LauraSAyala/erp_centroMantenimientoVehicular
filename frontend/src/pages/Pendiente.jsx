import PageHeader from '../components/ui/PageHeader.jsx';

export default function Pendiente({ titulo }) {
  return (
    <>
      <PageHeader titulo={titulo} />
      <div className="alert alert-secondary">Módulo en desarrollo.</div>
    </>
  );
}