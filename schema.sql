-- Base de datos normalizada (3FN): Tienda
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorias (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS productos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL,
    precio       REAL NOT NULL CHECK (precio >= 0),
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    categoria_id INTEGER NOT NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE IF NOT EXISTS clientes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL,
    email   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pedidos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id  INTEGER NOT NULL,
    fecha       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS detalle_pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id       INTEGER NOT NULL,
    producto_id     INTEGER NOT NULL,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario REAL NOT NULL,
    FOREIGN KEY (pedido_id)   REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);
