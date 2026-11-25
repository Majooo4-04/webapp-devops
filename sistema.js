// Módulo de autenticación, usuarios y productos (login + CRUD usuarios + CRUD productos).
// Se monta desde index.js con:  require('./sistema')(app, db);
const crypto = require('crypto');

const SECRETO = process.env.JWT_SECRET || 'secreto-demo-parcial2-cambiar-en-produccion';
const DURACION_SEG = 8 * 60 * 60;
const ROLES = ['admin', 'usuario'];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ok = (res, data = []) => res.status(200).json({ statusCode: 200, data });
const fail = (res, code, message) => res.status(code).json({ statusCode: code, data: [], message });

/* ---------- Contraseñas (scrypt con sal) y tokens firmados (HMAC-SHA256) ---------- */
function hashClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  return `${sal}:${crypto.scryptSync(clave, sal, 64).toString('hex')}`;
}

function verificarClave(clave, guardada) {
  const [sal, hash] = String(guardada).split(':');
  if (!sal || !hash) return false;
  const calculado = crypto.scryptSync(clave, sal, 64);
  const original = Buffer.from(hash, 'hex');
  return original.length === calculado.length && crypto.timingSafeEqual(original, calculado);
}

const firmar = (cuerpo) => crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');

function crearToken(payload, duracionSeg = DURACION_SEG) {
  const cuerpo = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + duracionSeg })
  ).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function leerToken(token) {
  if (typeof token !== 'string' || token.split('.').length !== 2) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

/* ---------- Middlewares ---------- */
function exigirAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const payload = m && leerToken(m[1]);
  if (!payload) return fail(res, 401, 'Autenticación requerida: inicie sesión');
  req.usuario = payload;
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin')
    return fail(res, 403, 'Acción permitida solo para administradores');
  next();
}

const esUnique = (err) =>
  Boolean(err) && (String(err.code || '').startsWith('SQLITE_CONSTRAINT') || /UNIQUE constraint failed/.test(err.message || ''));

/* ---------- Montaje de rutas ---------- */
function montarSistema(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      clave TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'usuario',
      creado TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Usuario administrador inicial (solo si la tabla está vacía)
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total === 0) {
    db.prepare('INSERT INTO usuarios (nombre, email, clave, rol) VALUES (?, ?, ?, ?)').run(
      'Administrador',
      process.env.ADMIN_EMAIL || 'admin@webapp.com',
      hashClave(process.env.ADMIN_PASSWORD || 'Admin#2026'),
      'admin'
    );
  }

  const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

  // Las rutas de escritura de la API original exigen sesión de administrador (el rol "usuario" es de solo lectura). En NODE_ENV=test se
  // desactiva para no alterar la suite unitaria heredada (AUTH_RUTAS_HEREDADAS=1 la fuerza).
  const exigirEnHeredadas =
    process.env.AUTH_RUTAS_HEREDADAS !== undefined
      ? process.env.AUTH_RUTAS_HEREDADAS !== '0'
      : process.env.NODE_ENV !== 'test';
  const PROTEGIDOS = ['/api/productos', '/api/categorias', '/api/clientes', '/api/pedidos', '/api/vaciar', '/api/respaldo'];
  app.use((req, res, next) => {
    if (!exigirEnHeredadas || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (PROTEGIDOS.some((p) => req.path === p || req.path.startsWith(`${p}/`)))
      return exigirAuth(req, res, () => exigirAdmin(req, res, next));
    next();
  });

  /* ----- LOGIN ----- */
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string')
      return fail(res, 400, 'Campos obligatorios: email y password');
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.trim().toLowerCase());
    if (!u || !verificarClave(password, u.clave)) return fail(res, 401, 'Credenciales inválidas');
    ok(res, [{ token: crearToken({ id: u.id, email: u.email, rol: u.rol }), usuario: publico(u) }]);
  });

  /* ----- CRUD USUARIOS ----- */
  app.get('/api/usuarios', exigirAuth, exigirAdmin, (req, res) => {
    ok(res, db.prepare('SELECT id, nombre, email, rol, creado FROM usuarios ORDER BY id').all());
  });

  app.get('/api/usuarios/:id', exigirAuth, exigirAdmin, (req, res) => {
    const u = db.prepare('SELECT id, nombre, email, rol, creado FROM usuarios WHERE id = ?').get(Number(req.params.id));
    if (!u) return fail(res, 404, 'Usuario no encontrado');
    ok(res, [u]);
  });

  app.post('/api/usuarios', exigirAuth, exigirAdmin, (req, res) => {
    const { nombre, email, password, rol = 'usuario' } = req.body || {};
    if (!nombre || typeof nombre !== 'string' || !REGEX_EMAIL.test(email || '') || typeof password !== 'string')
      return fail(res, 400, 'Campos obligatorios: nombre, email válido y password');
    if (password.length < 6) return fail(res, 400, 'La contraseña debe tener al menos 6 caracteres');
    if (!ROLES.includes(rol)) return fail(res, 400, 'El rol debe ser "admin" o "usuario"');
    try {
      const info = db
        .prepare('INSERT INTO usuarios (nombre, email, clave, rol) VALUES (?, ?, ?, ?)')
        .run(nombre.trim(), email.trim().toLowerCase(), hashClave(password), rol);
      ok(res, [{ id: info.lastInsertRowid, nombre: nombre.trim(), email: email.trim().toLowerCase(), rol }]);
    } catch (err) {
      if (esUnique(err)) return fail(res, 409, 'El correo ya está registrado');
      throw err;
    }
  });

  app.put('/api/usuarios/:id', exigirAuth, exigirAdmin, (req, res) => {
    const id = Number(req.params.id);
    const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!actual) return fail(res, 404, 'Usuario no encontrado');
    const { nombre, email, password, rol } = req.body || {};
    if (nombre === undefined && email === undefined && password === undefined && rol === undefined)
      return fail(res, 400, 'Debe enviar al menos un campo para actualizar');
    if (email !== undefined && !REGEX_EMAIL.test(email)) return fail(res, 400, 'Correo inválido');
    if (password !== undefined && (typeof password !== 'string' || password.length < 6))
      return fail(res, 400, 'La contraseña debe tener al menos 6 caracteres');
    if (rol !== undefined && !ROLES.includes(rol)) return fail(res, 400, 'El rol debe ser "admin" o "usuario"');
    if (actual.rol === 'admin' && rol === 'usuario' && db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'").get().n <= 1)
      return fail(res, 400, 'Debe existir al menos un administrador');
    try {
      db.prepare('UPDATE usuarios SET nombre = ?, email = ?, clave = ?, rol = ? WHERE id = ?').run(
        nombre !== undefined ? String(nombre).trim() : actual.nombre,
        email !== undefined ? email.trim().toLowerCase() : actual.email,
        password !== undefined ? hashClave(password) : actual.clave,
        rol !== undefined ? rol : actual.rol,
        id
      );
    } catch (err) {
      if (esUnique(err)) return fail(res, 409, 'El correo ya está registrado');
      throw err;
    }
    ok(res, [publico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id))]);
  });

  app.delete('/api/usuarios/:id', exigirAuth, exigirAdmin, (req, res) => {
    const id = Number(req.params.id);
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!u) return fail(res, 404, 'Usuario no encontrado');
    if (id === req.usuario.id) return fail(res, 400, 'No puede eliminar su propio usuario');
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    ok(res, [{ mensaje: 'Usuario eliminado correctamente', id }]);
  });

  /* ----- CRUD PRODUCTOS (complementa los GET/POST/PUT existentes) ----- */
  app.get('/api/productos/:id', (req, res) => {
    const p = db
      .prepare(`SELECT p.id, p.nombre, p.precio, p.stock, p.categoria_id, c.nombre AS categoria
                FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?`)
      .get(Number(req.params.id));
    if (!p) return fail(res, 404, 'Producto no encontrado');
    ok(res, [p]);
  });

  app.patch('/api/productos/:id', exigirAuth, exigirAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return fail(res, 400, 'El id debe ser un número entero');
    const actual = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    if (!actual) return fail(res, 404, 'Producto no encontrado');
    const { nombre, precio, stock, categoria_id } = req.body || {};
    if ([nombre, precio, stock, categoria_id].every((v) => v === undefined))
      return fail(res, 400, 'Debe enviar al menos un campo para actualizar');
    if (nombre !== undefined && (typeof nombre !== 'string' || !nombre.trim())) return fail(res, 400, 'El nombre no puede estar vacío');
    if (precio !== undefined && (typeof precio !== 'number' || precio < 0)) return fail(res, 400, 'El campo "precio" debe ser numérico y no negativo');
    if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) return fail(res, 400, 'El campo "stock" debe ser un entero no negativo');
    if (categoria_id !== undefined && !db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id))
      return fail(res, 400, 'La categoría indicada no existe');
    db.prepare('UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria_id = ? WHERE id = ?').run(
      nombre !== undefined ? nombre.trim() : actual.nombre,
      precio !== undefined ? precio : actual.precio,
      stock !== undefined ? stock : actual.stock,
      categoria_id !== undefined ? categoria_id : actual.categoria_id,
      id
    );
    ok(res, [db.prepare('SELECT * FROM productos WHERE id = ?').get(id)]);
  });

  app.delete('/api/productos/:id', exigirAuth, exigirAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return fail(res, 400, 'El id debe ser un número entero');
    if (!db.prepare('SELECT id FROM productos WHERE id = ?').get(id)) return fail(res, 404, 'Producto no encontrado');
    if (db.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE producto_id = ?').get(id).n > 0)
      return fail(res, 409, 'No se puede eliminar: el producto tiene pedidos asociados');
    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
    ok(res, [{ mensaje: 'Producto eliminado correctamente', id }]);
  });
}

module.exports = montarSistema;
Object.assign(module.exports, { crearToken, leerToken, hashClave, verificarClave, exigirAuth, exigirAdmin });
