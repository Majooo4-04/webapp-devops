const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS productos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL,
    precio       REAL NOT NULL CHECK (precio >= 0),
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    categoria_id INTEGER NOT NULL REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email  TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id  INTEGER NOT NULL REFERENCES clientes(id),
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
    fecha       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = { db, DB_PATH, BACKUP_DIR };