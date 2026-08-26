-- Drop snapshot columns from items_pedido
-- These are replaced by temporal lookups against precios_default / precios_cliente
ALTER TABLE items_pedido
  DROP COLUMN IF EXISTS precio_lista,
  DROP COLUMN IF EXISTS precio_diferencial,
  DROP COLUMN IF EXISTS descuento_item_tipo,
  DROP COLUMN IF EXISTS descuento_item_valor;
