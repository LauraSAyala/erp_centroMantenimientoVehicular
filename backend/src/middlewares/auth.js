import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

// Verifica el token de la cookie y carga el usuario desde la BD
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'No autenticado' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: payload.id },
      select: {
        id_usuario: true,
        nombre: true,
        apellido: true,
        email: true,
        rol: true,
        id_sede: true,
        activo: true,
        debe_cambiar_password: true,
      },
    });

    // Si lo desactivaron después de iniciar sesión, pierde el acceso
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Sesión inválida' });
    }

    req.user = usuario;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' });
  }
}

// Uso: requireRole('administrador', 'lider_area')
export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, mensaje: 'No autenticado' });
    }
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ ok: false, mensaje: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

// RNF-10: fija req.sedeId
// Líder, mecánico y cajero: siempre su propia sede (se ignora lo que envíen).
// Administrador: puede enviar ?id_sede= o id_sede en el body; si no, queda null (todas las sedes).
export function requireSede(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, mensaje: 'No autenticado' });
  }

  if (req.user.rol === 'administrador') {
    const idSede = req.query.id_sede || req.body?.id_sede;
    req.sedeId = idSede ? Number(idSede) : null;
  } else {
    req.sedeId = req.user.id_sede;
  }
  next();
}