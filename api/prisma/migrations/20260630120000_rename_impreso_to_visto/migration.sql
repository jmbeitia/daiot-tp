-- Renombrar `impreso` a `visto`: el flag ahora representa que el operador
-- vio el pedido (no que se imprimió). Preserva el valor actual de cada fila.
ALTER TABLE "pedidos" RENAME COLUMN "impreso" TO "visto";

-- El conteo y la fecha de impresión se derivan de `print_logs`.
ALTER TABLE "pedidos" DROP COLUMN "impresiones";
ALTER TABLE "pedidos" DROP COLUMN "ultimo_impreso_at";
