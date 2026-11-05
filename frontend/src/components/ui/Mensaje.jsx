// tipo: success | danger | warning | info
export default function Mensaje({ tipo = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${tipo} py-2`} role="alert">{children}</div>;
}