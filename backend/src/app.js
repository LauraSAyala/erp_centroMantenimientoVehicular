import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import saludRoutes from './routes/salud.routes.js';
import { manejarErrores } from './middlewares/errores.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

// Rutas de la API
app.use('/api/salud', saludRoutes);
app.use('/api/auth', authRoutes);                                          
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// En produccion, Express sirve el build de React (un solo servicio)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(manejarErrores);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));