-- CreateTable
CREATE TABLE "nodos_iot" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "ubicacion" TEXT,
    "umbral_alerta" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ultimo_visto" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodos_iot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lecturas_ambientales" (
    "id" SERIAL NOT NULL,
    "nodo_id" INTEGER NOT NULL,
    "temperatura" DOUBLE PRECISION NOT NULL,
    "humedad" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecturas_ambientales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuraciones_nodo" (
    "id" SERIAL NOT NULL,
    "nodo_id" INTEGER NOT NULL,
    "umbral_alerta" DOUBLE PRECISION NOT NULL,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuraciones_nodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nodos_iot_codigo_key" ON "nodos_iot"("codigo");

-- CreateIndex
CREATE INDEX "lecturas_ambientales_nodo_id_ts_idx" ON "lecturas_ambientales"("nodo_id", "ts");

-- AddForeignKey
ALTER TABLE "lecturas_ambientales" ADD CONSTRAINT "lecturas_ambientales_nodo_id_fkey" FOREIGN KEY ("nodo_id") REFERENCES "nodos_iot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones_nodo" ADD CONSTRAINT "configuraciones_nodo_nodo_id_fkey" FOREIGN KEY ("nodo_id") REFERENCES "nodos_iot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones_nodo" ADD CONSTRAINT "configuraciones_nodo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
