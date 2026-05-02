import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function reset() {
  const hash = await bcrypt.hash('jame17291', 10);
  await prisma.user.update({
    where: { username: 'Jameel' },
    data: { password: hash }
  });
  console.log("Password reset successfully.");
}

reset();
