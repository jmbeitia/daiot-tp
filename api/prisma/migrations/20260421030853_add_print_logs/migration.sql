-- CreateTable
CREATE TABLE "print_logs" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL,
    "error_msg" TEXT,
    "printer_msg" TEXT,

    CONSTRAINT "print_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "print_logs" ADD CONSTRAINT "print_logs_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
