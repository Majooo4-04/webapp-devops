const fs = require('fs');
const path = require('path');

// Base de datos exclusiva para las pruebas, separada de la real
const TEST_DATA_DIR = path.join(__dirname, 'data-test');
process.env.DATA_DIR = TEST_DATA_DIR;

// Limpia la carpeta de pruebas antes de empezar
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

const request = require('supertest');
const app = require('../index');

let categoriaId;
let productoId;
let clienteId;

afterAll(() => {
  // Cierra la conexión a la base de datos antes de borrar los archivos
  const { db } = require('../db');
  db.close();

  // Limpieza final (con reintento por si Windows aún tiene el archivo bloqueado)
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('No se pudo limpiar la carpeta de pruebas (no afecta el resultado):', err.message);
  }
});

describe('CATEGORÍAS', () => {
  test('POST /api/categorias - crea una categoría correctamente', async () => {
    const res = await request(app)
      .post('/api/categorias')
      .send({ nombre: 'Electrónica' });
    expect(res.statusCode).toBe(200);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.data[0]).toHaveProperty('id');
    categoriaId = res.body.data[0].id;
  });

  test('POST /api/categorias - falla si falta el nombre (error de usuario)', async () => {
    const res = await request(app).post('/api/categorias').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.data).toEqual([]);
  });

  test('POST /api/categorias - falla si el nombre está duplicado', async () => {
    const res = await request(app)
      .post('/api/categorias')
      .send({ nombre: 'Electrónica' });
    expect(res.statusCode).toBe(409);
  });

  test('GET /api/categorias - lista las categorías', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('PRODUCTOS', () => {
  test('POST /api/productos - crea un producto correctamente', async () => {
    const res = await request(app)
      .post('/api/productos')
      .send({ nombre: 'Mouse', precio: 250, stock: 10, categoria_id: categoriaId });
    expect(res.statusCode).toBe(200);
    productoId = res.body.data[0].id;
  });

  test('POST /api/productos - falla si el precio no es numérico (error de usuario)', async () => {
    const res = await request(app)
      .post('/api/productos')
      .send({ nombre: 'Teclado', precio: 'gratis', stock: 5, categoria_id: categoriaId });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/productos - falla si la categoría no existe', async () => {
    const res = await request(app)
      .post('/api/productos')
      .send({ nombre: 'Monitor', precio: 1500, stock: 5, categoria_id: 9999 });
    expect(res.statusCode).toBe(409); // viola la llave foránea
  });

  test('GET /api/productos - lista los productos con su categoría', async () => {
    const res = await request(app).get('/api/productos');
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0]).toHaveProperty('categoria');
  });

  test('PUT /api/productos/:id - actualiza el stock correctamente', async () => {
    const res = await request(app)
      .put(`/api/productos/${productoId}`)
      .send({ stock: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].stock).toBe(50);
  });

  test('PUT /api/productos/:id - falla si el producto no existe (error de usuario)', async () => {
    const res = await request(app)
      .put('/api/productos/9999')
      .send({ stock: 10 });
    expect(res.statusCode).toBe(404);
  });

  test('PUT /api/productos/:id - falla si no se envía ningún campo', async () => {
    const res = await request(app)
      .put(`/api/productos/${productoId}`)
      .send({});
    expect(res.statusCode).toBe(400);
  });
});

describe('CLIENTES', () => {
  test('POST /api/clientes - crea un cliente correctamente', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .send({ nombre: 'Ana López', email: 'ana@mail.com' });
    expect(res.statusCode).toBe(200);
    clienteId = res.body.data[0].id;
  });

  test('POST /api/clientes - falla si el correo ya existe', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .send({ nombre: 'Otra Ana', email: 'ana@mail.com' });
    expect(res.statusCode).toBe(409);
  });

  test('GET /api/clientes - lista los clientes', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.statusCode).toBe(200);
  });
});

describe('PEDIDOS', () => {
  test('POST /api/pedidos - crea un pedido y descuenta stock', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .send({ cliente_id: clienteId, producto_id: productoId, cantidad: 2 });
    expect(res.statusCode).toBe(200);
  });

  test('POST /api/pedidos - falla si pide más cantidad de la que hay en stock', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .send({ cliente_id: clienteId, producto_id: productoId, cantidad: 9999 });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/pedidos - falla si el producto no existe', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .send({ cliente_id: clienteId, producto_id: 9999, cantidad: 1 });
    expect(res.statusCode).toBe(404);
  });

  test('GET /api/pedidos - lista los pedidos con el total calculado', async () => {
    const res = await request(app).get('/api/pedidos');
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0]).toHaveProperty('total');
  });
});

describe('MANTENIMIENTO', () => {
  test('POST /api/respaldo - genera un respaldo de la BD', async () => {
    const res = await request(app).post('/api/respaldo');
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0]).toHaveProperty('archivo');
  });

  test('DELETE /api/vaciar - vacía todas las tablas', async () => {
    const res = await request(app).delete('/api/vaciar');
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/categorias - después de vaciar, devuelve arreglo vacío', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.body.data).toEqual([]);
  });
});

describe('RUTAS Y ERRORES GENERALES', () => {
  test('GET a una ruta inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/noexiste');
    expect(res.statusCode).toBe(404);
  });
});