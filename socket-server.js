const net = require('net');
const { db } = require('./db');

const SOCKET_PORT = process.env.SOCKET_PORT || 6061;

// Procesa el comando "insert"
function handleInsert(payload) {
  let body;
  try {
    body = JSON.parse(payload);
  } catch {
    return { statusCode: 400, data: [], message: 'JSON inválido en el elemento' };
  }
  const { nombre } = body;
  if (!nombre || typeof nombre !== 'string') {
    return { statusCode: 400, data: [], message: 'El campo "nombre" es obligatorio' };
  }
  try {
    const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre.trim());
    return { statusCode: 200, data: [{ id: info.lastInsertRowid, nombre: nombre.trim() }] };
  } catch (err) {
    return { statusCode: 409, data: [], message: 'No se pudo insertar (posible duplicado)' };
  }
}

// Procesa el comando "get"
function handleGet(payload) {
  const clave = payload.trim();

  if (clave.toLowerCase() === 'all') {
    const rows = db.prepare('SELECT * FROM categorias ORDER BY id').all();
    return { statusCode: 200, data: rows };
  }

  const id = Number(clave);
  if (!Number.isInteger(id)) {
    return { statusCode: 400, data: [], message: 'Se esperaba un id numérico o "all"' };
  }
  const row = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!row) return { statusCode: 404, data: [], message: 'Elemento no encontrado' };
  return { statusCode: 200, data: [row] };
}

// Interpreta el mensaje recibido: {insert:...} o {get:...}
function procesarMensaje(mensaje) {
  const texto = mensaje.trim();
  const match = texto.match(/^\{(insert|get):([\s\S]*)\}$/);
  if (!match) {
    return { statusCode: 400, data: [], message: 'Formato inválido. Use {insert:<element>} o {get:<element>}' };
  }
  const comando = match[1];
  const payload = match[2];
  return comando === 'insert' ? handleInsert(payload) : handleGet(payload);
}

// Inicia el servidor de sockets TCP
function iniciarServidorSocket() {
  const server = net.createServer((socket) => {
    console.log('Cliente TCP conectado:', socket.remoteAddress);
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const linea = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!linea.trim()) continue;
        const resultado = procesarMensaje(linea);
        socket.write(JSON.stringify(resultado) + '\n');
      }
    });

    socket.on('error', (err) => console.error('Error de socket:', err.message));
  });

  server.listen(SOCKET_PORT, '0.0.0.0', () => {
    console.log(`Servidor de sockets TCP escuchando en el puerto ${SOCKET_PORT}`);
  });

  return server;
}

module.exports = { iniciarServidorSocket };