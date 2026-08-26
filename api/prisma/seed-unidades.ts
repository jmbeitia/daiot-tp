import { prisma } from "../src/lib/prisma";

const unidades = [
  { nombre: "atado",   abreviacion: "a."   },
  { nombre: "bandeja", abreviacion: "bdj." },
  { nombre: "bolsa",   abreviacion: "b."   },
  { nombre: "bolson",  abreviacion: "bsn." },
  { nombre: "caja",    abreviacion: "cja." },
  { nombre: "cajon",   abreviacion: "c."   },
  { nombre: "docena",  abreviacion: "doc." },
  { nombre: "kg",      abreviacion: "kg"   },
  { nombre: "paquete", abreviacion: "paq." },
  { nombre: "unidad",  abreviacion: "u."   },
];

export async function seedUnidades(): Promise<Map<string, number>> {
  console.log("Insertando unidades...");
  const map = new Map<string, number>();

  for (const u of unidades) {
    const unidad = await prisma.unidad.upsert({
      where: { nombre: u.nombre },
      update: { abreviacion: u.abreviacion },
      create: { nombre: u.nombre, abreviacion: u.abreviacion },
    });
    map.set(unidad.nombre, unidad.id);
  }

  console.log(`${unidades.length} unidades listas.`);
  return map;
}

if (require.main === module) {
  seedUnidades()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
