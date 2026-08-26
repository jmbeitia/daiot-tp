-- AlterTable: agregar columna abreviacion a unidades
ALTER TABLE "unidades" ADD COLUMN "abreviacion" TEXT;

-- Poblar abreviaciones para las unidades existentes
UPDATE "unidades" SET "abreviacion" = 'kg'   WHERE "nombre" = 'kg';
UPDATE "unidades" SET "abreviacion" = 'c.'   WHERE "nombre" = 'cajon';
UPDATE "unidades" SET "abreviacion" = 'b.'   WHERE "nombre" = 'bolsa';
UPDATE "unidades" SET "abreviacion" = 'a.'   WHERE "nombre" = 'atado';
UPDATE "unidades" SET "abreviacion" = 'u.'   WHERE "nombre" = 'unidad';
UPDATE "unidades" SET "abreviacion" = 'bdj.' WHERE "nombre" = 'bandeja';
UPDATE "unidades" SET "abreviacion" = 'paq.' WHERE "nombre" = 'paquete';
UPDATE "unidades" SET "abreviacion" = 'cja.' WHERE "nombre" = 'caja';
UPDATE "unidades" SET "abreviacion" = 'bsn.' WHERE "nombre" = 'bolson';
UPDATE "unidades" SET "abreviacion" = 'doc.' WHERE "nombre" = 'docena';

-- CreateIndex
CREATE UNIQUE INDEX "unidades_abreviacion_key" ON "unidades"("abreviacion");
