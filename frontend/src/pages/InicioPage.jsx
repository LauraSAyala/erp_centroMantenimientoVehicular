import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';

export default function InicioPage() {
  const { usuario } = useAuth();
  return (
    <PageHeader titulo={`Bienvenido, ${usuario.nombre}`} subtitulo="Selecciona una opción del menú." />
  );
}