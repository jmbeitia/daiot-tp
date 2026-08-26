-- Modelo de precio transparente en items_pedido
-- Reemplaza precio_original por desglose explícito: precio_lista, precio_diferencial,
-- descuento_item_tipo, descuento_item_valor

-- Agregar nuevas columnas
ALTER TABLE "items_pedido"
  ADD COLUMN "precio_lista"         DECIMAL(65,30),
  ADD COLUMN "precio_diferencial"   DECIMAL(65,30),
  ADD COLUMN "descuento_item_tipo"  TEXT,
  ADD COLUMN "descuento_item_valor" DECIMAL(65,30);

-- Migrar datos existentes: precio_lista = precio_original (mejor aproximación disponible)
UPDATE "items_pedido" SET "precio_lista" = "precio_original";

-- Eliminar columna anterior
ALTER TABLE "items_pedido" DROP COLUMN "precio_original";
