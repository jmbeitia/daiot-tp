-- ─────────────────────────────────────────────
-- Nuevas tablas: categorias y unidades
-- ─────────────────────────────────────────────

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_nombre_key" ON "unidades"("nombre");

-- ─────────────────────────────────────────────
-- productos: reemplazar categoria (String) por categoria_id (FK)
-- ─────────────────────────────────────────────

-- AlterTable: quitar categoria, agregar categoria_id nullable
ALTER TABLE "productos" DROP COLUMN IF EXISTS "categoria";
ALTER TABLE "productos" ADD COLUMN "categoria_id" INTEGER;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey"
    FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- precios_default: vaciar tabla y agregar unidad_id NOT NULL
-- Los datos se vuelven a cargar con el seed
-- ─────────────────────────────────────────────

TRUNCATE TABLE "precios_default" CASCADE;

-- Eliminar índice único antiguo (solo produto_id)
DROP INDEX IF EXISTS "precios_default_producto_id_key";

-- Agregar unidad_id (NOT NULL — tabla vacía)
ALTER TABLE "precios_default" ADD COLUMN "unidad_id" INTEGER NOT NULL;

-- Nuevo índice único (produto_id, unidad_id)
CREATE UNIQUE INDEX "precios_default_producto_id_unidad_id_key"
    ON "precios_default"("producto_id", "unidad_id");

-- AddForeignKey
ALTER TABLE "precios_default" ADD CONSTRAINT "precios_default_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- precios_cliente: vaciar tabla y agregar unidad_id NOT NULL
-- ─────────────────────────────────────────────

TRUNCATE TABLE "precios_cliente" CASCADE;

-- Eliminar índice único antiguo
DROP INDEX IF EXISTS "precios_cliente_cliente_id_producto_id_key";

-- Agregar unidad_id (NOT NULL — tabla vacía)
ALTER TABLE "precios_cliente" ADD COLUMN "unidad_id" INTEGER NOT NULL;

-- Nuevo índice único
CREATE UNIQUE INDEX "precios_cliente_cliente_id_producto_id_unidad_id_key"
    ON "precios_cliente"("cliente_id", "producto_id", "unidad_id");

-- AddForeignKey
ALTER TABLE "precios_cliente" ADD CONSTRAINT "precios_cliente_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- pedidos: campos de descuento e impresión
-- ─────────────────────────────────────────────

ALTER TABLE "pedidos"
    ADD COLUMN "descuento_tipo"    TEXT,
    ADD COLUMN "descuento_valor"   DECIMAL(65,30),
    ADD COLUMN "descuento_motivo"  TEXT,
    ADD COLUMN "impreso"           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "impresiones"       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "ultimo_impreso_at" TIMESTAMP(3);

-- ─────────────────────────────────────────────
-- items_pedido: unidad_id opcional (FK a unidades)
-- ─────────────────────────────────────────────

ALTER TABLE "items_pedido" ADD COLUMN "unidad_id" INTEGER;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
