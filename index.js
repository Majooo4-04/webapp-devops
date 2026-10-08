const express = require('express');
const path = require('path');
const { db, BACKUP_DIR } = require('./db');
const { iniciarServidorSocket } = require('./socket-server');

const app = express();
app.use(express.json());

// Formato de respuesta estándar: { statusCode, data: [] }
const ok = (res, data = []) => res.status(200).json({ statusCode: 200, data });
const fail = (res, code, message) =>
  res.status(code).json({ statusCode: code, data: [], message });

// Ruta de bienvenida
app.get('/', (req, res) =>
  ok(res, [{ mensaje: 'API funcionando correctamente' }])
);

// ===== AQUÍ IRÁN LOS ENDPOINTS (siguiente paso) =====
/* ---------- CATEGORÍAS ---------- */
// 1. GET
app.get('/api/categorias', (req, res) => {
  ok(res, db.prepare('SELECT * FROM categorias ORDER BY id').all());
});

// 2. POST
app.post('/api/categorias', (req, res) => {
  const { nombre } = req.body;
  if (!nombre || typeof nombre !== 'string')
    return fail(res, 400, 'El campo "nombre" es obligatorio');
  const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre.trim());
  ok(res, [{ id: info.lastInsertRowid, nombre: nombre.trim() }]);
});

/* ---------- PRODUCTOS ---------- */
// 3. GET
app.get('/api/productos', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.nombre, p.precio, p.stock, c.nombre AS categoria
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    ORDER BY p.id
  `).all();
  ok(res, rows);
});
// PUT - Actualizar precio y/o stock de un producto
app.put('/api/productos/:id', (req, res) => {
  const id = Number(req.params.id);
  const { precio, stock } = req.body;

  if (!Number.isInteger(id)) return fail(res, 400, 'El id debe ser un número entero');
  if (precio === undefined && stock === undefined)
    return fail(res, 400, 'Debe enviar al menos "precio" o "stock" para actualizar');
  if (precio !== undefined && typeof precio !== 'number')
    return fail(res, 400, 'El campo "precio" debe ser numérico');
  if (stock !== undefined && !Number.isInteger(stock))
    return fail(res, 400, 'El campo "stock" debe ser un entero');

  const existente = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!existente) return fail(res, 404, 'Producto no encontrado');

  const nuevoPrecio = precio !== undefined ? precio : existente.precio;
  const nuevoStock = stock !== undefined ? stock : existente.stock;

  db.prepare('UPDATE productos SET precio = ?, stock = ? WHERE id = ?')
    .run(nuevoPrecio, nuevoStock, id);

  ok(res, [{ id, nombre: existente.nombre, precio: nuevoPrecio, stock: nuevoStock }]);
});

// 4. POST
app.post('/api/productos', (req, res) => {
  const { nombre, precio, stock = 0, categoria_id } = req.body;
  if (!nombre || typeof precio !== 'number' || !Number.isInteger(categoria_id))
    return fail(res, 400, 'Campos obligatorios: nombre, precio (número), categoria_id (entero)');
  const info = db
    .prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
    .run(nombre, precio, stock, categoria_id);
  ok(res, [{ id: info.lastInsertRowid, nombre, precio, stock, categoria_id }]);
});

/* ---------- CLIENTES ---------- */
// 5. GET
app.get('/api/clientes', (req, res) => {
  ok(res, db.prepare('SELECT * FROM clientes ORDER BY id').all());
});

// 6. POST
app.post('/api/clientes', (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email)
    return fail(res, 400, 'Campos obligatorios: nombre, email');
  const info = db.prepare('INSERT INTO clientes (nombre, email) VALUES (?, ?)').run(nombre, email);
  ok(res, [{ id: info.lastInsertRowid, nombre, email }]);
});

/* ---------- PEDIDOS ---------- */
// 7. GET
app.get('/api/pedidos', (req, res) => {
  const rows = db.prepare(`
    SELECT pe.id, cl.nombre AS cliente, pr.nombre AS producto,
           pe.cantidad, pr.precio, (pe.cantidad * pr.precio) AS total, pe.fecha
    FROM pedidos pe
    JOIN clientes  cl ON cl.id = pe.cliente_id
    JOIN productos pr ON pr.id = pe.producto_id
    ORDER BY pe.id
  `).all();
  ok(res, rows);
});

// 8. POST (descuenta stock dentro de una transacción)
app.post('/api/pedidos', (req, res) => {
  const { cliente_id, producto_id, cantidad } = req.body;
  if (!Number.isInteger(cliente_id) || !Number.isInteger(producto_id) || !Number.isInteger(cantidad) || cantidad < 1)
    return fail(res, 400, 'Campos obligatorios (enteros): cliente_id, producto_id, cantidad >= 1');

  const crearPedido = db.transaction(() => {
    const prod = db.prepare('SELECT stock FROM productos WHERE id = ?').get(producto_id);
    if (!prod) return { error: [404, 'Producto no encontrado'] };
    if (prod.stock < cantidad) return { error: [400, 'Stock insuficiente'] };
    db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(cantidad, producto_id);
    const info = db
      .prepare('INSERT INTO pedidos (cliente_id, producto_id, cantidad) VALUES (?, ?, ?)')
      .run(cliente_id, producto_id, cantidad);
    return { id: info.lastInsertRowid };
  });

  const result = crearPedido();
  if (result.error) return fail(res, ...result.error);
  ok(res, [{ id: result.id, cliente_id, producto_id, cantidad }]);
});
/* ---------- MANTENIMIENTO ---------- */
// 9. POST - Backup de la BD
app.post('/api/respaldo', async (req, res, next) => {
  try {
    const archivo = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    await db.backup(path.join(BACKUP_DIR, archivo));
    ok(res, [{ mensaje: 'Backup creado correctamente', archivo }]);
  } catch (err) {
    next(err);
  }
});
app.get('/api/respaldo/descargar', async (req, res, next) => {
  try {
    const archivo = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    const rutaCompleta = path.join(BACKUP_DIR, archivo);
    await db.backup(rutaCompleta);
    res.download(rutaCompleta, archivo, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
});

// 10. DELETE - Vaciar la BD
app.delete('/api/vaciar', (req, res) => {
  db.transaction(() => {
    db.exec(`
      DELETE FROM pedidos;
      DELETE FROM productos;
      DELETE FROM clientes;
      DELETE FROM categorias;
      DELETE FROM sqlite_sequence;
    `);
  })();
  ok(res, [{ mensaje: 'Base de datos vaciada correctamente' }]);
});
// GET /api/health
app.get('/api/health', (req, res) => {
  ok(res, [{
    status: 'ok',
    version: '1.1.0',
    mensaje: 'Pipeline CI/CD funcionando correctamente',
    timestamp: new Date().toISOString()
  }]);
});

// 404 y manejo de errores
app.use((req, res) => fail(res, 404, 'Ruta no encontrada'));

app.use((err, req, res, next) => {
  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT'))
    return fail(res, 409, 'Violación de restricción (dato duplicado o referencia inexistente)');
  console.error(err);
  fail(res, 500, 'Error interno del servidor');
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
  iniciarServidorSocket();
}

module.exports = app;


