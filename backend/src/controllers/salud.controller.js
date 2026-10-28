import { prisma } from '../db.js';

export async function estadoSistema(req, res) {
  const sedes = await prisma.sede.count();
  res.json({ ok: true, sedes, ahora: new Date().toISOString() });
}