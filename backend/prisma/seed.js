import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sede = await prisma.sede.create({
    data: { ciudad: 'Bucaramanga', direccion: 'Sede principal', telefono: '0000000' },
  });

  const password_hash = await bcrypt.hash('Admin12345', 12);

  await prisma.usuario.create({
    data: {
      nombre: 'Admin',
      apellido: 'Sistema',
      identificacion: '0000000001',
      email: 'admin@erp.com',
      password_hash,
      rol: 'administrador',
      debe_cambiar_password: false,
    },
  });

  const rolesPrueba = [
    ['lider_area', 'Lider', 'lider@erp.com', '0000000002'],
    ['mecanico', 'Mecanico', 'mecanico@erp.com', '0000000003'],
    ['cajero', 'Cajero', 'cajero@erp.com', '0000000004'],
  ];

  for (const [rol, nombre, email, identificacion] of rolesPrueba) {
    await prisma.usuario.create({
      data: {
        nombre,
        apellido: 'Prueba',
        identificacion,
        email,
        password_hash,
        rol,
        id_sede: sede.id_sede,
        debe_cambiar_password: false,
      },
    });
  }

  console.log('Seed listo. Todos los usuarios tienen la contraseña: Admin12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());