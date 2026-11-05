# Guía de estilo del frontend

1. Solo Bootstrap 5. No agregar otras librerías de UI ni de CSS.
2. Los colores se definen únicamente en src/styles/theme.css.
   Prohibido usar style={{ color: ... }} con colores fijos.
3. Cada página empieza con <PageHeader titulo="..." />.
4. Formularios: React Hook Form + zod + <CampoForm>. Botón principal: btn btn-primary.
5. Llamadas al backend: solo con api de src/api/client.js (nunca fetch directo).
6. Datos del servidor: TanStack Query (useQuery / useMutation).
7. Estados de carga y error: <Cargando /> y <Mensaje tipo="danger">.
8. Tablas: dentro de <div className="tabla-responsive"> y con
   className="table table-hover align-middle".
9. Colores de alertas de órdenes: verde (a tiempo), amarillo (por vencer),
   rojo (retrasada), usando las variables --estado-* de theme.css.
10. Probar siempre a 360 px de ancho antes de abrir el PR.
11. Textos de la interfaz en español, con tildes.
12. Cada módulo vive en src/pages/<modulo>/. Los archivos compartidos
    (App.jsx, config/menu.js, theme.css) se editan con PR pequeños.