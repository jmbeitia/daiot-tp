-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "deshecho_at" TIMESTAMP(3),
ADD COLUMN     "fusionado_at" TIMESTAMP(3),
ADD COLUMN     "fusionado_en_id" INTEGER;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_fusionado_en_id_fkey" FOREIGN KEY ("fusionado_en_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
