import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';

const loginSchema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1, 'Obligatoria'),
  passwordNueva: z.string().min(8, 'Mínimo 8 caracteres'),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000, // 8 horas
};

export async function login(req, res) {
  const datos = loginSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Datos inválidos',
      errores: z.flattenError(datos.error).fieldErrors,
    });
  }

  const { email, password } = datos.data;
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  // Mismo mensaje si no existe o la clave es incorrecta (no revelar cuál falló)
  const credencialesOk =
    usuario && usuario.activo && (await bcrypt.compare(password, usuario.password_hash));
  if (!credencialesOk) {
    return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos' });
  }

  const token = jwt.sign({ id: usuario.id_usuario, rol: usuario.rol }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.cookie('token', token, cookieOptions);

  return res.json({
    ok: true,
    usuario: {
      id_usuario: usuario.id_usuario,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
      id_sede: usuario.id_sede,
      debe_cambiar_password: usuario.debe_cambiar_password,
    },
  });
}

export function logout(req, res) {
  res.clearCookie('token', { ...cookieOptions, maxAge: undefined });
  return res.json({ ok: true, mensaje: 'Sesión cerrada' });
}

// Devuelve el usuario de la sesión actual (el frontend lo usa al recargar la página)
export function me(req, res) {
  return res.json({ ok: true, usuario: req.user });
}

export async function cambiarPassword(req, res) {
  const datos = cambiarPasswordSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Datos inválidos',
      errores: z.flattenError(datos.error).fieldErrors,
    });
  }

  const { passwordActual, passwordNueva } = datos.data;

  const usuario = await prisma.usuario.findUnique({ where: { id_usuario: req.user.id_usuario } });
  const coincide = await bcrypt.compare(passwordActual, usuario.password_hash);
  if (!coincide) {
    return res.status(401).json({ ok: false, mensaje: 'La contraseña actual es incorrecta' });
  }

  const nuevoHash = await bcrypt.hash(passwordNueva, 12);
  await prisma.usuario.update({
    where: { id_usuario: usuario.id_usuario },
    data: { password_hash: nuevoHash, debe_cambiar_password: false },
  });

  return res.json({ ok: true, mensaje: 'Contraseña actualizada' });
}