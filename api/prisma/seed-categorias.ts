import { prisma } from "../src/lib/prisma";

const categorias = [
  { nombre: "verduras" },
  { nombre: "frutas" },
  { nombre: "hojas" },
  { nombre: "lechugas" },
  { nombre: "bolseria" },
  { nombre: "aromaticas" },
  { nombre: "varios" },
  { nombre: "otros" },
];

export async function seedCategorias(): Promise<Map<string, number>> {
  console.log("Insertando categorías...");
  const map = new Map<string, number>();

  for (const c of categorias) {
    const cat = await prisma.categoria.upsert({
      where: { nombre: c.nombre },
      update: {},
      create: { nombre: c.nombre },
    });
    map.set(cat.nombre, cat.id);
  }

  console.log(`${categorias.length} categorías listas.`);
  return map;
}

if (require.main === module) {
  seedCategorias()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
