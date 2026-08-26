-- Precio versioning: add fecha_desde/fecha_hasta, remove unique constraints
-- Existing records become the initial "active" version (fecha_hasta = NULL)

-- Drop unique constraints
DROP INDEX IF EXISTS "precios_default_producto_id_unidad_id_key";
DROP INDEX IF EXISTS "precios_cliente_cliente_id_producto_id_unidad_id_key";

-- Add versioning columns to precios_default
ALTER TABLE "precios_default"
  ADD COLUMN "fecha_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "fecha_hasta" TIMESTAMP(3);

-- Add versioning columns to precios_cliente
ALTER TABLE "precios_cliente"
  ADD COLUMN "fecha_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "fecha_hasta" TIMESTAMP(3);

-- Indexes for efficient active-price lookups
CREATE INDEX "precios_default_producto_id_unidad_id_fecha_hasta_idx"
  ON "precios_default"("producto_id", "unidad_id", "fecha_hasta");

CREATE INDEX "precios_cliente_cliente_id_producto_id_unidad_id_fecha_hasta_idx"
  ON "precios_cliente"("cliente_id", "producto_id", "unidad_id", "fecha_hasta");
