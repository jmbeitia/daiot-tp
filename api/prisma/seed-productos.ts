import { prisma } from "../src/lib/prisma";
import { seedCategorias } from "./seed-categorias";
import { seedUnidades } from "./seed-unidades";

interface ProductoSeed {
  nombre: string;
  categoria: string;
  unidad_default: string;
}

const productos: ProductoSeed[] = [
  // BOLSERÍA
  { nombre: "Papa Negra",              categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Papa Cepillada",          categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Papa Agro",               categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Cebollín",                categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Cebolla",                 categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Cebolla Morada",          categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Batata",                  categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Boniato",                 categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Zanahoria",               categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Zanahoria Industrial",    categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Bolsa de Remolacha",      categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Anco",                    categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Cabutia",                 categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Mandioca",                categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Sandía",                  categoria: "bolseria", unidad_default: "unidad" },
  { nombre: "Carbón Chico",            categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Carbón Grande",           categoria: "bolseria", unidad_default: "bolsa"  },
  { nombre: "Leña",                    categoria: "bolseria", unidad_default: "bolsa"  },
  // VARIOS
  { nombre: "Cajón de Huevos",         categoria: "varios",   unidad_default: "cajon"  },
  // LECHUGAS
  { nombre: "Lechuga Criolla",         categoria: "lechugas", unidad_default: "cajon"  },
  { nombre: "Lechuga Manteca",         categoria: "lechugas", unidad_default: "cajon"  },
  { nombre: "Lechuga Morada",          categoria: "lechugas", unidad_default: "cajon"  },
  { nombre: "Lechuga Capuchina",       categoria: "lechugas", unidad_default: "cajon"  },
  { nombre: "Lechuga Francesa",        categoria: "lechugas", unidad_default: "cajon"  },
  // HOJAS
  { nombre: "Verdeo",                  categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Puerro",                  categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Apio",                    categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Radichetta",              categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Rúcula",                  categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Albahaca",                categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Perejil",                 categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Hinojo",                  categoria: "hojas",    unidad_default: "atado"  },
  { nombre: "Espinaca",                categoria: "hojas",    unidad_default: "cajon"  },
  { nombre: "Acelga",                  categoria: "hojas",    unidad_default: "cajon"  },
  // VERDURAS
  { nombre: "Choclo",                  categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Chaucha Ancha",           categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Chaucha Roliza",          categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Ají Vinagre",             categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Ají Picante",             categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Berenjena",               categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Zucchini",                categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Zapallito",               categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Morrón Rojo",             categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Morrón Amarillo",         categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Morrón Verde",            categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Pepino",                  categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Brócoli",                 categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Coliflor",                categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Tomate Cherry",           categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Tomate Redondo",          categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Tomate Perita",           categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Repollo Blanco",          categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Repollo Morado",          categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Remolacha",               categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Rabanito",                categoria: "verduras", unidad_default: "cajon"  },
  { nombre: "Repollito Brucela",       categoria: "verduras", unidad_default: "cajon"  },
  // FRUTAS
  { nombre: "Banana Ecuador",          categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Banana Paraguay",         categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Banana Boliviana",        categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Manzana 100/110",         categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Manzana 125",             categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Manzana T80",             categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Manzana Granel",          categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Manzana Granny",          categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Pera T80",                categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Pera T100",               categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Durazno",                 categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Damasco",                 categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Pelón",                   categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Lima",                    categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Ciruela",                 categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Melón",                   categoria: "frutas",   unidad_default: "unidad" },
  { nombre: "Naranja Ombligo",         categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Naranja Frío Premium",    categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Naranja Jugo Común",      categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Mandarina Común",         categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Mandarina Criolla/Nova",  categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Pomelo",                  categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Limón",                   categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Kiwi",                    categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Palta Oferta",            categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Palta Propal T50/60",     categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Uva Rosada",              categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Uva Verde",               categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Arándano",                categoria: "frutas",   unidad_default: "bandeja"},
  { nombre: "Cereza",                  categoria: "frutas",   unidad_default: "kg"     },
  { nombre: "Membrillo",               categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Frutilla x Bandeja",      categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Mango",                   categoria: "frutas",   unidad_default: "cajon"  },
  { nombre: "Ananá",                   categoria: "frutas",   unidad_default: "unidad" },
  { nombre: "Papaya",                  categoria: "frutas",   unidad_default: "unidad" },
];

export async function seedProductos(
  categoriasMap?: Map<string, number>,
  unidadesMap?: Map<string, number>,
) {
  const cats = categoriasMap ?? (await seedCategorias());
  const unis = unidadesMap ?? (await seedUnidades());

  console.log(`Insertando ${productos.length} productos...`);

  for (const p of productos) {
    const categoria_id = cats.get(p.categoria) ?? null;
    const unidad_id = unis.get(p.unidad_default) ?? null;

    const producto = await prisma.producto.upsert({
      where: { nombre: p.nombre },
      update: { categoria_id, unidad_default: p.unidad_default },
      create: { nombre: p.nombre, categoria_id, unidad_default: p.unidad_default },
    });

    if (unidad_id !== null) {
      const existe = await prisma.precioDefault.findFirst({
        where: { producto_id: producto.id, unidad_id },
      });
      if (!existe) {
        await prisma.precioDefault.create({
          data: { producto_id: producto.id, unidad_id, precio: null },
        });
      }
    }
  }

  console.log("Productos insertados.");
}

if (require.main === module) {
  seedProductos()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
