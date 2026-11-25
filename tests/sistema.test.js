const fs = require('fs');
const os = require('os');
const path = require('path');

// Base de datos aislada para esta suite
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-test-'));

const request = require('supertest');
const app = require('../index');
const sistema = require('../sistema');

const ADMIN = { email: 'admin@webapp.com', password: 'Admin#2026' };
const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function loginAdmin() {
  const res = await request(app).post('/api/login').send(ADMIN);
  return `Bearer ${res.body.data[0].token}`;
}

describe('Tokens y contraseñas', () => {
  test('un token válido se puede leer y uno manipulado se rechaza', () => {
    const token = sistema.crearToken({ id: 7, rol: 'admin' });
    expect(sistema.leerToken(token).id).toBe(7);
    expect(sistema.leerToken(`${token}x`)).toBeNull();
    expect(sistema.leerToken('basura')).toBeNull();
  });

  test('un token vencido se rechaza', () => {
    expect(sistema.leerToken(sistema.crearToken({ id: 1 }, -10))).toBeNull();
  });

  test('la contraseña se guarda con hash y se verifica', () => {
    const guardada = sistema.hashClave('secreto1');
    expect(guardada).not.toContain('secreto1');
    expect(sistema.verificarClave('secreto1', guardada)).toBe(true);
    expect(sistema.verificarClave('otra', guardada)).toBe(false);
  });
});

describe('POST /api/login', () => {
  test('credenciales correctas devuelven token y usuario sin contraseña', async () => {
    const res = await request(app).post('/api/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data[0].token).toBeTruthy();
    expect(res.body.data[0].usuario).toEqual(expect.objectContaining({ email: ADMIN.email, rol: 'admin' }));
    expect(res.body.data[0].usuario.clave).toBeUndefined();
  });

  test('contraseña incorrecta devuelve 401', async () => {
    const res = await request(app).post('/api/login').send({ email: ADMIN.email, password: 'mala' });
    expect(res.status).toBe(401);
  });

  test('usuario inexistente devuelve 401', async () => {
    const res = await request(app).post('/api/login').send({ email: 'nadie@correo.com', password: 'secreto1' });
    expect(res.status).toBe(401);
  });

  test('faltan campos devuelve 400', async () => {
    expect((await request(app).post('/api/login').send({})).status).toBe(400);
  });
});

describe('CRUD de usuarios', () => {
  test('sin token devuelve 401', async () => {
    expect((await request(app).get('/api/usuarios')).status).toBe(401);
  });

  test('flujo completo: crear, listar, consultar, actualizar y eliminar', async () => {
    const auth = await loginAdmin();
    const email = `u${unico()}@correo.com`;

    const crear = await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'Prueba', email, password: 'secreto1' });
    expect(crear.status).toBe(200);
    const id = crear.body.data[0].id;

    const lista = await request(app).get('/api/usuarios').set('Authorization', auth);
    expect(lista.body.data.map((u) => u.email)).toContain(email);

    const uno = await request(app).get(`/api/usuarios/${id}`).set('Authorization', auth);
    expect(uno.body.data[0].nombre).toBe('Prueba');

    const actualiza = await request(app).put(`/api/usuarios/${id}`).set('Authorization', auth)
      .send({ nombre: 'Prueba 2', rol: 'admin' });
    expect(actualiza.body.data[0]).toEqual(expect.objectContaining({ nombre: 'Prueba 2', rol: 'admin' }));

    const elimina = await request(app).delete(`/api/usuarios/${id}`).set('Authorization', auth);
    expect(elimina.status).toBe(200);
    expect((await request(app).get(`/api/usuarios/${id}`).set('Authorization', auth)).status).toBe(404);
  });

  test('correo duplicado devuelve 409 y datos inválidos devuelven 400', async () => {
    const auth = await loginAdmin();
    const dup = await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'Dup', email: ADMIN.email, password: 'secreto1' });
    expect(dup.status).toBe(409);
    const malo = await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'X', email: 'no-es-correo', password: '123' });
    expect(malo.status).toBe(400);
  });

  test('un usuario normal no puede crear usuarios (403)', async () => {
    const auth = await loginAdmin();
    const email = `n${unico()}@correo.com`;
    await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'Normal', email, password: 'secreto1' });
    const normal = await request(app).post('/api/login').send({ email, password: 'secreto1' });
    const res = await request(app).post('/api/usuarios')
      .set('Authorization', `Bearer ${normal.body.data[0].token}`)
      .send({ nombre: 'X', email: `x${unico()}@correo.com`, password: 'secreto1' });
    expect(res.status).toBe(403);
  });

  test('un usuario normal no puede listar ni consultar usuarios (403)', async () => {
    const auth = await loginAdmin();
    const email = `l${unico()}@correo.com`;
    const crea = await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'Lector', email, password: 'secreto1' });
    const normal = await request(app).post('/api/login').send({ email, password: 'secreto1' });
    const tokenNormal = `Bearer ${normal.body.data[0].token}`;
    expect((await request(app).get('/api/usuarios').set('Authorization', tokenNormal)).status).toBe(403);
    expect((await request(app).get(`/api/usuarios/${crea.body.data[0].id}`).set('Authorization', tokenNormal)).status).toBe(403);
  });

  test('no se puede eliminar el propio usuario', async () => {
    const auth = await loginAdmin();
    const lista = await request(app).get('/api/usuarios').set('Authorization', auth);
    const admin = lista.body.data.find((u) => u.email === ADMIN.email);
    const res = await request(app).delete(`/api/usuarios/${admin.id}`).set('Authorization', auth);
    expect(res.status).toBe(400);
  });
});

describe('CRUD de productos (consulta, edición y eliminación)', () => {
  async function crearProducto() {
    const cat = await request(app).post('/api/categorias').send({ nombre: `Cat${unico()}` });
    const categoriaId = cat.body.data[0].id;
    const prod = await request(app).post('/api/productos')
      .send({ nombre: `Prod${unico()}`, precio: 10, stock: 5, categoria_id: categoriaId });
    return { id: prod.body.data[0].id, categoriaId };
  }

  test('GET /api/productos/:id devuelve el producto con su categoría', async () => {
    const { id } = await crearProducto();
    const res = await request(app).get(`/api/productos/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ id, stock: 5 }));
    expect(res.body.data[0].categoria).toBeTruthy();
  });

  test('GET /api/productos/:id inexistente devuelve 404', async () => {
    expect((await request(app).get('/api/productos/999999')).status).toBe(404);
  });

  test('PATCH actualiza campos y exige sesión', async () => {
    const { id } = await crearProducto();
    expect((await request(app).patch(`/api/productos/${id}`).send({ precio: 99 })).status).toBe(401);
    const auth = await loginAdmin();
    const res = await request(app).patch(`/api/productos/${id}`).set('Authorization', auth)
      .send({ nombre: 'Renombrado', precio: 12.5, stock: 8 });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ nombre: 'Renombrado', precio: 12.5, stock: 8 }));
  });

  test('PATCH valida los datos', async () => {
    const { id } = await crearProducto();
    const auth = await loginAdmin();
    expect((await request(app).patch(`/api/productos/${id}`).set('Authorization', auth).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/productos/${id}`).set('Authorization', auth).send({ precio: 'x' })).status).toBe(400);
    expect((await request(app).patch(`/api/productos/${id}`).set('Authorization', auth).send({ categoria_id: 999999 })).status).toBe(400);
    expect((await request(app).patch('/api/productos/999999').set('Authorization', auth).send({ precio: 1 })).status).toBe(404);
  });

  test('DELETE elimina el producto y exige sesión', async () => {
    const { id } = await crearProducto();
    expect((await request(app).delete(`/api/productos/${id}`)).status).toBe(401);
    const auth = await loginAdmin();
    expect((await request(app).delete(`/api/productos/${id}`).set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get(`/api/productos/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/productos/${id}`).set('Authorization', auth)).status).toBe(404);
  });

  test('un usuario normal puede consultar pero no editar ni eliminar productos (403)', async () => {
    const { id } = await crearProducto();
    const auth = await loginAdmin();
    const email = `r${unico()}@correo.com`;
    await request(app).post('/api/usuarios').set('Authorization', auth)
      .send({ nombre: 'Lector', email, password: 'secreto1' });
    const normal = await request(app).post('/api/login').send({ email, password: 'secreto1' });
    const tokenNormal = `Bearer ${normal.body.data[0].token}`;
    expect((await request(app).get(`/api/productos/${id}`)).status).toBe(200);
    expect((await request(app).patch(`/api/productos/${id}`).set('Authorization', tokenNormal).send({ precio: 1 })).status).toBe(403);
    expect((await request(app).delete(`/api/productos/${id}`).set('Authorization', tokenNormal)).status).toBe(403);
  });

  test('DELETE de un producto con pedidos devuelve 409', async () => {
    const { id } = await crearProducto();
    const cli = await request(app).post('/api/clientes').send({ nombre: 'Cli', email: `c${unico()}@correo.com` });
    await request(app).post('/api/pedidos').send({ cliente_id: cli.body.data[0].id, producto_id: id, cantidad: 1 });
    const auth = await loginAdmin();
    expect((await request(app).delete(`/api/productos/${id}`).set('Authorization', auth)).status).toBe(409);
  });
});
