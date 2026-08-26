-- ============================================================
-- SCHEMA - Tienda de Frutas Luján
-- ============================================================

-- Usuarios del sistema (panel web)
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  rol         VARCHAR(20)  NOT NULL DEFAULT 'operador', -- admin | operador | readonly
  activo      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Clientes de WhatsApp
CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150),
  telefono    VARCHAR(30)  UNIQUE NOT NULL,
  contact_id  VARCHAR(100),               -- Google Contacts ID
  activo      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Catálogo de productos
CREATE TABLE IF NOT EXISTS productos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  categoria       VARCHAR(50)  NOT NULL,   -- verduras | frutas | hojas | lechugas | bolserio | aromaticas | varios
  unidad_default  VARCHAR(20)  NOT NULL,   -- kg | cajon | atado | bolsa | unidad | bandeja | paquete
  activo          BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Precio base (lista general)
CREATE TABLE IF NOT EXISTS precios_default (
  id          SERIAL PRIMARY KEY,
  producto_id INT          NOT NULL REFERENCES productos(id),
  precio      NUMERIC(12,2),               -- NULL = sin precio definido (-)
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE(producto_id)
);

-- Precio especial por cliente (sobreescribe precios_default)
CREATE TABLE IF NOT EXISTS precios_cliente (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT          NOT NULL REFERENCES clientes(id),
  producto_id INT          NOT NULL REFERENCES productos(id),
  precio      NUMERIC(12,2) NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE(cliente_id, producto_id)
);

-- Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT          REFERENCES clientes(id),
  fecha           TIMESTAMP    NOT NULL DEFAULT NOW(),
  estado          VARCHAR(30)  NOT NULL DEFAULT 'recibido', -- recibido | en_preparacion | listo | entregado
  whatsapp_msg    TEXT,
  printer_msg     TEXT,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Ítems de cada pedido
CREATE TABLE IF NOT EXISTS items_pedido (
  id              SERIAL PRIMARY KEY,
  pedido_id       INT          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id     INT          REFERENCES productos(id),  -- NULL si no matcheó
  producto_raw    VARCHAR(200) NOT NULL,                  -- texto original del AI
  cantidad        NUMERIC(10,3) NOT NULL,
  unidad          VARCHAR(20)  NOT NULL,
  precio_unitario NUMERIC(12,2)                           -- precio al momento del pedido
);

-- ============================================================
-- SEED - Productos y precios base (lista 26/03/2025)
-- ============================================================

INSERT INTO productos (nombre, categoria, unidad_default) VALUES
-- VERDURAS
('Berenjena',       'verduras', 'cajon'),
('Ají vinagre',     'verduras', 'cajon'),
('Ají picante',     'verduras', 'kg'),
('Brócoli',         'verduras', 'unidad'),
('Cherry',          'verduras', 'cajon'),
('Choclo',          'verduras', 'unidad'),
('Coliflor',        'verduras', 'unidad'),
('Morrón amarillo', 'verduras', 'cajon'),
('Morrón rojo',     'verduras', 'cajon'),
('Morrón verde',    'verduras', 'cajon'),
('Pepino',          'verduras', 'unidad'),
('Remolacha',       'verduras', 'cajon'),
('Repollo blanco y morado', 'verduras', 'unidad'),
('Tomate perita',   'verduras', 'kg'),
('Tomate redondo',  'verduras', 'kg'),
('Zapallito',       'verduras', 'unidad'),
('Chaucha',         'verduras', 'cajon'),
('Zucchini',        'verduras', 'unidad'),
-- FRUTAS
('Arándano',        'frutas', 'bandeja'),
('Banana ecuatoriana extra azul', 'frutas', 'caja'),
('Banana ecuatoriana', 'frutas', 'caja'),
('Ciruela',         'frutas', 'cajon'),
('Frutilla',        'frutas', 'cajon'),
('Kiwi',            'frutas', 'cajon'),
('Lima',            'frutas', 'unidad'),
('Limón',           'frutas', 'cajon'),
('Manzana deliciosa',     'frutas', 'cajon'),
('Manzana deliciosa T110','frutas', 'cajon'),
('Manzana deliciosa T125','frutas', 'cajon'),
('Manzana verde',   'frutas', 'cajon'),
('Naranja',         'frutas', 'cajon'),
('Naranja de frío', 'frutas', 'cajon'),
('Palta',           'frutas', 'unidad'),
('Pera',            'frutas', 'cajon'),
('Pomelo',          'frutas', 'cajon'),
('Sandía',          'frutas', 'unidad'),
('Uva rosada',      'frutas', 'cajon'),
-- HOJAS
('Acelga',          'hojas', 'cajon'),
('Albahaca',        'hojas', 'atado'),
('Apio',            'hojas', 'atado'),
('Espinaca',        'hojas', 'cajon'),
('Perejil',         'hojas', 'atado'),
('Puerro',          'hojas', 'atado'),
('Rúcula',          'hojas', 'cajon'),
('Verdeo',          'hojas', 'atado'),
-- LECHUGAS
('Lechuga criolla',   'lechugas', 'cajon'),
('Lechuga capuchina', 'lechugas', 'cajon'),
('Lechuga francesa',  'lechugas', 'cajon'),
('Lechuga manteca',   'lechugas', 'cajon'),
('Lechuga morada',    'lechugas', 'cajon'),
-- BOLSERÍA
('Anco batata',     'bolserio', 'bolsa'),
('Batata',          'bolserio', 'bolsa'),
('Cebolla',         'bolserio', 'bolsa'),
('Papa',            'bolserio', 'bolsa'),
('Papa agro natural','bolserio', 'bolsa'),
('Mandioca',        'bolserio', 'kg'),
('Carbón chico',    'bolserio', 'unidad'),
('Carbón grande',   'bolserio', 'unidad'),
('Boniato',         'bolserio', 'kg'),
('Cabutier',        'bolserio', 'unidad'),
('Zanahoria',       'bolserio', 'bolsa'),
-- AROMÁTICAS
('Ciboulette',      'aromaticas', 'paquete'),
('Tomillo',         'aromaticas', 'paquete'),
('Romero',          'aromaticas', 'paquete'),
('Eneldo',          'aromaticas', 'paquete'),
('Cilantro',        'aromaticas', 'atado'),
('Menta',           'aromaticas', 'paquete'),
-- VARIOS
('Brote de soja',   'varios', 'kg'),
('Huevo cajón N°1', 'varios', 'cajon'),
('Huevo cajón N°2', 'varios', 'cajon'),
('Huevo cajón N°3', 'varios', 'cajon'),
('Jengibre',        'varios', 'kg'),
('Champiñón',       'varios', 'kg'),
('Portobello',      'varios', 'kg');

-- Precios default (en ARS, lista 26/03/2025)
-- Se usa subquery por nombre para evitar hardcodear IDs
INSERT INTO precios_default (producto_id, precio) VALUES
((SELECT id FROM productos WHERE nombre = 'Berenjena'),           12000),
((SELECT id FROM productos WHERE nombre = 'Ají vinagre'),          8000),
((SELECT id FROM productos WHERE nombre = 'Ají picante'),          2500),
((SELECT id FROM productos WHERE nombre = 'Brócoli'),              3000),
((SELECT id FROM productos WHERE nombre = 'Cherry'),              16000),
((SELECT id FROM productos WHERE nombre = 'Choclo'),              17000),
((SELECT id FROM productos WHERE nombre = 'Coliflor'),             3000),
((SELECT id FROM productos WHERE nombre = 'Morrón amarillo'),     25000),
((SELECT id FROM productos WHERE nombre = 'Morrón rojo'),         35000),
((SELECT id FROM productos WHERE nombre = 'Morrón verde'),        17000),
((SELECT id FROM productos WHERE nombre = 'Pepino'),              10000),
((SELECT id FROM productos WHERE nombre = 'Remolacha'),           12000),
((SELECT id FROM productos WHERE nombre = 'Repollo blanco y morado'), 20000),
((SELECT id FROM productos WHERE nombre = 'Tomate perita'),       25000),
((SELECT id FROM productos WHERE nombre = 'Tomate redondo'),      25000),
((SELECT id FROM productos WHERE nombre = 'Zapallito'),           25000),
((SELECT id FROM productos WHERE nombre = 'Chaucha'),             27000),
((SELECT id FROM productos WHERE nombre = 'Zucchini'),            22000),
((SELECT id FROM productos WHERE nombre = 'Arándano'),             2000),
((SELECT id FROM productos WHERE nombre = 'Banana ecuatoriana extra azul'), 35000),
((SELECT id FROM productos WHERE nombre = 'Banana ecuatoriana'),  30000),
((SELECT id FROM productos WHERE nombre = 'Ciruela'),             28000),
((SELECT id FROM productos WHERE nombre = 'Frutilla'),            38000),
((SELECT id FROM productos WHERE nombre = 'Kiwi'),                38000),
((SELECT id FROM productos WHERE nombre = 'Lima'),                 2500),
((SELECT id FROM productos WHERE nombre = 'Limón'),               17000),
((SELECT id FROM productos WHERE nombre = 'Manzana deliciosa'),   32000),
((SELECT id FROM productos WHERE nombre = 'Manzana deliciosa T110'), 28000),
((SELECT id FROM productos WHERE nombre = 'Manzana deliciosa T125'), 28000),
((SELECT id FROM productos WHERE nombre = 'Manzana verde'),       35000),
((SELECT id FROM productos WHERE nombre = 'Naranja'),             10000),
((SELECT id FROM productos WHERE nombre = 'Naranja de frío'),     12000),
((SELECT id FROM productos WHERE nombre = 'Palta'),                 900),
((SELECT id FROM productos WHERE nombre = 'Pera'),                15000),
((SELECT id FROM productos WHERE nombre = 'Pomelo'),              25000),
((SELECT id FROM productos WHERE nombre = 'Sandía'),              NULL),   -- sin precio definido
((SELECT id FROM productos WHERE nombre = 'Uva rosada'),          20000),
((SELECT id FROM productos WHERE nombre = 'Acelga'),              14000),
((SELECT id FROM productos WHERE nombre = 'Albahaca'),              700),
((SELECT id FROM productos WHERE nombre = 'Apio'),                 2000),
((SELECT id FROM productos WHERE nombre = 'Espinaca'),            12000),
((SELECT id FROM productos WHERE nombre = 'Perejil'),              2500),
((SELECT id FROM productos WHERE nombre = 'Puerro'),               3500),
((SELECT id FROM productos WHERE nombre = 'Rúcula'),              10000),
((SELECT id FROM productos WHERE nombre = 'Verdeo'),               3000),
((SELECT id FROM productos WHERE nombre = 'Lechuga criolla'),     10000),
((SELECT id FROM productos WHERE nombre = 'Lechuga capuchina'),   18000),
((SELECT id FROM productos WHERE nombre = 'Lechuga francesa'),    10000),
((SELECT id FROM productos WHERE nombre = 'Lechuga manteca'),     12000),
((SELECT id FROM productos WHERE nombre = 'Lechuga morada'),      10000),
((SELECT id FROM productos WHERE nombre = 'Anco batata'),          8000),
((SELECT id FROM productos WHERE nombre = 'Batata'),               8000),
((SELECT id FROM productos WHERE nombre = 'Cebolla'),              5500),
((SELECT id FROM productos WHERE nombre = 'Papa'),                 6000),
((SELECT id FROM productos WHERE nombre = 'Papa agro natural'),   18000),
((SELECT id FROM productos WHERE nombre = 'Mandioca'),            19000),
((SELECT id FROM productos WHERE nombre = 'Carbón chico'),         2500),
((SELECT id FROM productos WHERE nombre = 'Carbón grande'),        5000),
((SELECT id FROM productos WHERE nombre = 'Boniato'),             12000),
((SELECT id FROM productos WHERE nombre = 'Cabutier'),             9000),
((SELECT id FROM productos WHERE nombre = 'Zanahoria'),            6000),
((SELECT id FROM productos WHERE nombre = 'Ciboulette'),           1700),
((SELECT id FROM productos WHERE nombre = 'Tomillo'),              1700),
((SELECT id FROM productos WHERE nombre = 'Romero'),               1700),
((SELECT id FROM productos WHERE nombre = 'Eneldo'),               1700),
((SELECT id FROM productos WHERE nombre = 'Cilantro'),             1200),
((SELECT id FROM productos WHERE nombre = 'Menta'),                1200),
((SELECT id FROM productos WHERE nombre = 'Brote de soja'),        2500),
((SELECT id FROM productos WHERE nombre = 'Huevo cajón N°1'),     68000),
((SELECT id FROM productos WHERE nombre = 'Huevo cajón N°2'),     64000),
((SELECT id FROM productos WHERE nombre = 'Huevo cajón N°3'),     59000),
((SELECT id FROM productos WHERE nombre = 'Jengibre'),             7500),
((SELECT id FROM productos WHERE nombre = 'Champiñón'),            3200),
((SELECT id FROM productos WHERE nombre = 'Portobello'),           3200);

-- Usuario admin inicial (password: cambiar en producción)
-- Hash bcrypt de "admin1234" generado offline
INSERT INTO usuarios (nombre, email, password, rol) VALUES
('Admin Uno', 'admin1@example.com', '$2b$10$PLACEHOLDER_HASH_CAMBIAR', 'admin'),
('Admin Dos', 'admin2@example.com', '$2b$10$PLACEHOLDER_HASH_CAMBIAR', 'admin');

