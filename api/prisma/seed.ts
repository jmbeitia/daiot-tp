import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";
import { seedCategorias } from "./seed-categorias";
import { seedUnidades } from "./seed-unidades";
import { seedProductos } from "./seed-productos";

async function main() {
  const hash = await bcrypt.hash("cambiar1234", 10);

  await prisma.usuario.upsert({
    where: { email: "joaquin.manuel.beitia@gmail.com" },
    update: {},
    create: {
      nombre: "Joaquín Beitia",
      email: "joaquin.manuel.beitia@gmail.com",
      password: hash,
      rol: "admin",
    },
  });

  const cats = await seedCategorias();
  const unis = await seedUnidades();
  await seedProductos(cats, unis);

  console.log("Seed completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
