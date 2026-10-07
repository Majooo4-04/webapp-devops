const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.join(__dirname, 'data-test-socket');
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.SOCKET_PORT = 7071; // puerto distinto para no chocar con otras pruebas

if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

const net = require('net');
const { iniciarServidorSocket } = require('../socket-server');

let server;

beforeAll((done) => {
  server = iniciarServidorSocket();
  server.on('listening', done);
});

afterAll((done) => {
  const { db } = require('../db');
  db.close();
  server.close(() => {
    try {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('No se pudo limpiar:', err.message);
    }
    done();
  });
});

function enviarComando(comando) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(process.env.SOCKET_PORT, 'localhost', () => {
      client.write(comando + '\n');
    });
    client.on('data', (data) => {
      resolve(JSON.parse(data.toString().trim()));
      client.end();
    });
    client.on('error', reject);
  });
}

describe('SERVIDOR DE SOCKETS TCP', () => {
  test('{insert:...} crea un elemento correctamente', async () => {
    const res = await enviarComando('{insert:{"nombre":"Deportes"}}');
    expect(res.statusCode).toBe(200);
    expect(res.data[0]).toHaveProperty('id');
  });

  test('{insert:...} falla si falta el nombre', async () => {
    const res = await enviarComando('{insert:{"otraCosa":"valor"}}');
    expect(res.statusCode).toBe(400);
  });

  test('{insert:...} falla con JSON mal formado', async () => {
    const res = await enviarComando('{insert:{nombre:"SinComillas"}}');
    expect(res.statusCode).toBe(400);
  });

  test('{insert:...} falla si el nombre está duplicado', async () => {
    const res = await enviarComando('{insert:{"nombre":"Deportes"}}');
    expect(res.statusCode).toBe(409);
  });

  test('{get:all} devuelve todos los elementos', async () => {
    const res = await enviarComando('{get:all}');
    expect(res.statusCode).toBe(200);
    expect(res.data.length).toBeGreaterThan(0);
  });

  test('{get:<id>} devuelve un elemento específico', async () => {
    const res = await enviarComando('{get:1}');
    expect(res.statusCode).toBe(200);
  });

  test('{get:<id>} devuelve 404 si no existe', async () => {
    const res = await enviarComando('{get:9999}');
    expect(res.statusCode).toBe(404);
  });

  test('{get:<valor_no_numerico>} devuelve 400', async () => {
    const res = await enviarComando('{get:abc}');
    expect(res.statusCode).toBe(400);
  });

  test('comando con formato inválido devuelve 400', async () => {
    const res = await enviarComando('{comando_invalido:1}');
    expect(res.statusCode).toBe(400);
  });
});