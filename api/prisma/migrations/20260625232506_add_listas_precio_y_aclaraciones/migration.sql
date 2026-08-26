-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "aclaraciones" TEXT,
ADD COLUMN     "lista_precio_id" INTEGER;

-- CreateTable
CREATE TABLE "listas_precio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "es_default" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_lista" (
    "id" SERIAL NOT NULL,
    "lista_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "unidad_id" INTEGER NOT NULL,
    "precio" DECIMAL(65,30) NOT NULL,
    "fecha_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_hasta" TIMESTAMP(3),

    CONSTRAINT "precios_lista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precios_lista_lista_id_producto_id_unidad_id_fecha_hasta_idx" ON "precios_lista"("lista_id", "producto_id", "unidad_id", "fecha_hasta");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_precio" ADD CONSTRAINT "listas_precio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas_precio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migración de datos: PrecioCliente → ListaPrecio
-- Por cada cliente con precios especiales activos, crea una lista "Precios especiales" marcada como default
WITH clientes_con_precios AS (
  SELECT DISTINCT cliente_id FROM "precios_cliente" WHERE fecha_hasta IS NULL
),
listas_insertadas AS (
  INSERT INTO "listas_precio" (nombre, cliente_id, es_default, activo, created_at)
  SELECT 'Precios especiales', cliente_id, true, true, NOW()
  FROM clientes_con_precios
  RETURNING id, cliente_id
)
INSERT INTO "precios_lista" (lista_id, producto_id, unidad_id, precio, fecha_desde, fecha_hasta)
SELECT li.id, pc.producto_id, pc.unidad_id, pc.precio, pc.fecha_desde, pc.fecha_hasta
FROM "precios_cliente" pc
JOIN listas_insertadas li ON li.cliente_id = pc.cliente_id
WHERE pc.fecha_hasta IS NULL;
