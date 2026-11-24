const { test, expect } = require('@playwright/test');

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('API REST (E2E con Playwright)', () => {
  test('GET /api/health responde con estado Listo', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.statusCode).toBe(200);
    expect(json.data[0].status).toBe('Listo');
  });

  test('POST /api/categorias crea y GET /api/categorias la lista', async ({ request }) => {
    const nombre = `Cat-${unico()}`;
    const crear = await request.post('/api/categorias', { data: { nombre } });
    expect(crear.status()).toBe(200);
    const creada = (await crear.json()).data[0];
    expect(creada.nombre).toBe(nombre);

    const lista = await request.get('/api/categorias');
    const nombres = (await lista.json()).data.map((c) => c.nombre);
    expect(nombres).toContain(nombre);
  });

  test('POST /api/categorias sin nombre devuelve 400', async ({ request }) => {
    const res = await request.post('/api/categorias', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).statusCode).toBe(400);
  });

  test('ruta inexistente devuelve 404', async ({ request }) => {
    const res = await request.get('/api/noexiste');
    expect(res.status()).toBe(404);
  });

  test('flujo completo: categoría, producto, cliente y pedido descuentan stock', async ({ request }) => {
    const id = unico();

    const cat = await request.post('/api/categorias', { data: { nombre: `Flujo-${id}` } });
    const categoriaId = (await cat.json()).data[0].id;

    const prod = await request.post('/api/productos', {
      data: { nombre: `Producto-${id}`, precio: 25.5, stock: 10, categoria_id: categoriaId },
    });
    expect(prod.status()).toBe(200);
    const productoId = (await prod.json()).data[0].id;

    const cli = await request.post('/api/clientes', {
      data: { nombre: `Cliente-${id}`, email: `cliente-${id}@correo.com` },
    });
    expect(cli.status()).toBe(200);
    const clienteId = (await cli.json()).data[0].id;

    const pedido = await request.post('/api/pedidos', {
      data: { cliente_id: clienteId, producto_id: productoId, cantidad: 3 },
    });
    expect(pedido.status()).toBe(200);

    const productos = (await (await request.get('/api/productos')).json()).data;
    const actualizado = productos.find((p) => p.id === productoId);
    expect(actualizado.stock).toBe(7);
  });

  test('pedido con stock insuficiente devuelve 400', async ({ request }) => {
    const id = unico();
    const cat = await request.post('/api/categorias', { data: { nombre: `Stock-${id}` } });
    const categoriaId = (await cat.json()).data[0].id;
    const prod = await request.post('/api/productos', {
      data: { nombre: `Escaso-${id}`, precio: 10, stock: 1, categoria_id: categoriaId },
    });
    const productoId = (await prod.json()).data[0].id;
    const cli = await request.post('/api/clientes', {
      data: { nombre: `Cli-${id}`, email: `stock-${id}@correo.com` },
    });
    const clienteId = (await cli.json()).data[0].id;

    const pedido = await request.post('/api/pedidos', {
      data: { cliente_id: clienteId, producto_id: productoId, cantidad: 5 },
    });
    expect(pedido.status()).toBe(400);
  });
});
