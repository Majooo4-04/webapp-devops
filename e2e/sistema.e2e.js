const { test, expect } = require('@playwright/test');
const { ADMIN, sesionApi, cabeceras, entrarComoAdmin } = require('./helpers');

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('Login y control de acceso (API)', () => {
  test('login correcto devuelve token y datos del usuario', async ({ request }) => {
    const res = await request.post('/api/login', { data: ADMIN });
    expect(res.status()).toBe(200);
    const { token, usuario } = (await res.json()).data[0];
    expect(token).toBeTruthy();
    expect(usuario.rol).toBe('admin');
    expect(usuario.clave).toBeUndefined();
  });

  test('login con contraseña incorrecta devuelve 401', async ({ request }) => {
    const res = await request.post('/api/login', { data: { email: ADMIN.email, password: 'incorrecta' } });
    expect(res.status()).toBe(401);
  });

  test('login sin datos devuelve 400', async ({ request }) => {
    const res = await request.post('/api/login', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('GET /api/usuarios sin token devuelve 401', async ({ request }) => {
    expect((await request.get('/api/usuarios')).status()).toBe(401);
  });
});

test.describe('CRUD de usuarios (API)', () => {
  test('crear, consultar, actualizar y eliminar un usuario', async ({ request }) => {
    const headers = cabeceras((await sesionApi(request)).token);
    const id = unico();
    const email = `usuario-${id}@correo.com`;

    const crear = await request.post('/api/usuarios', { data: { nombre: `Usuario ${id}`, email, password: 'secreto1' }, headers });
    expect(crear.status()).toBe(200);
    const creado = (await crear.json()).data[0];
    expect(creado.rol).toBe('usuario');

    const duplicado = await request.post('/api/usuarios', { data: { nombre: 'Otro', email, password: 'secreto1' }, headers });
    expect(duplicado.status()).toBe(409);

    const uno = await request.get(`/api/usuarios/${creado.id}`, { headers });
    expect((await uno.json()).data[0].email).toBe(email);

    const actualiza = await request.put(`/api/usuarios/${creado.id}`, { data: { nombre: 'Nombre nuevo' }, headers });
    expect((await actualiza.json()).data[0].nombre).toBe('Nombre nuevo');

    const elimina = await request.delete(`/api/usuarios/${creado.id}`, { headers });
    expect(elimina.status()).toBe(200);
    expect((await request.get(`/api/usuarios/${creado.id}`, { headers })).status()).toBe(404);
  });

  test('un usuario sin rol admin no puede crear usuarios (403)', async ({ request }) => {
    const admin = cabeceras((await sesionApi(request)).token);
    const id = unico();
    const credenciales = { email: `normal-${id}@correo.com`, password: 'secreto1' };
    await request.post('/api/usuarios', { data: { nombre: 'Normal', ...credenciales }, headers: admin });
    const normal = cabeceras((await sesionApi(request, credenciales)).token);
    const res = await request.post('/api/usuarios', {
      data: { nombre: 'X', email: `x-${id}@correo.com`, password: 'secreto1' },
      headers: normal,
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('CRUD de productos (API)', () => {
  test('crear, consultar, actualizar y eliminar un producto', async ({ request }) => {
    const headers = cabeceras((await sesionApi(request)).token);
    const id = unico();
    const cat = await request.post('/api/categorias', { data: { nombre: `CRUD-${id}` }, headers });
    const categoriaId = (await cat.json()).data[0].id;

    const crear = await request.post('/api/productos', {
      data: { nombre: `Prod-${id}`, precio: 10, stock: 5, categoria_id: categoriaId },
      headers,
    });
    const productoId = (await crear.json()).data[0].id;

    const uno = await request.get(`/api/productos/${productoId}`);
    expect((await uno.json()).data[0].categoria).toBe(`CRUD-${id}`);

    const actualiza = await request.patch(`/api/productos/${productoId}`, { data: { nombre: `Prod-${id}-v2`, precio: 12.5 }, headers });
    const actualizado = (await actualiza.json()).data[0];
    expect(actualizado.precio).toBe(12.5);
    expect(actualizado.nombre).toBe(`Prod-${id}-v2`);

    expect((await request.delete(`/api/productos/${productoId}`, { headers })).status()).toBe(200);
    expect((await request.get(`/api/productos/${productoId}`)).status()).toBe(404);
  });

  test('eliminar sin sesión devuelve 401', async ({ request }) => {
    expect((await request.delete('/api/productos/1')).status()).toBe(401);
  });
});

test.describe('Interfaz: login, productos y usuarios', () => {
  test('sin sesión, el panel redirige a la pantalla de login', async ({ page }) => {
    await page.goto('/app/');
    await expect(page).toHaveURL(/login\.html$/);
    await expect(page.locator('#titulo')).toHaveText('Iniciar sesión');
  });

  test('login con credenciales inválidas muestra error', async ({ page }) => {
    await page.goto('/app/login.html');
    await page.fill('#email', ADMIN.email);
    await page.fill('#password', 'incorrecta');
    await page.click('#btn-login');
    await expect(page.locator('#mensaje')).toContainText('Credenciales inválidas');
    await expect(page).toHaveURL(/login\.html$/);
  });

  test('login correcto entra al panel y cerrar sesión regresa al login', async ({ page }) => {
    await page.goto('/app/login.html');
    await page.fill('#email', ADMIN.email);
    await page.fill('#password', ADMIN.password);
    await page.click('#btn-login');
    await expect(page.locator('#titulo')).toHaveText('Panel de Categorías');
    await expect(page.locator('#usuario-actual')).toContainText('admin');
    await page.click('#btn-salir');
    await expect(page).toHaveURL(/login\.html$/);
  });

  test('productos: crear, editar y eliminar desde la interfaz', async ({ page, request }) => {
    await entrarComoAdmin(page, request);
    const id = unico();
    const categoria = `UICat-${id}`;
    const nombre = `UIProd-${id}`;
    const headers = cabeceras((await sesionApi(request)).token);
    await request.post('/api/categorias', { data: { nombre: categoria }, headers });

    await page.goto('/app/productos.html');
    await expect(page.locator('#titulo')).toHaveText('Gestión de Productos');
    await page.selectOption('#categoria', { label: categoria });
    await page.fill('#nombre', nombre);
    await page.fill('#precio', '15.5');
    await page.fill('#stock', '4');
    await page.click('#btn-guardar');
    await expect(page.locator('#mensaje')).toHaveText('Producto creado correctamente');

    const fila = page.locator('#tabla-productos tbody tr', { hasText: nombre });
    await expect(fila).toContainText('15.50');

    await fila.locator('.btn-editar').click();
    await expect(page.locator('#nombre')).toHaveValue(nombre);
    await page.fill('#precio', '20');
    await page.click('#btn-guardar');
    await expect(page.locator('#mensaje')).toHaveText('Producto actualizado correctamente');
    await expect(fila).toContainText('20.00');

    page.once('dialog', (d) => d.accept());
    await fila.locator('.btn-eliminar').click();
    await expect(page.locator('#mensaje')).toHaveText('Producto eliminado correctamente');
    await expect(page.locator('#tabla-productos tbody')).not.toContainText(nombre);
  });

  test('usuarios: crear, rechazar duplicado y eliminar desde la interfaz', async ({ page, request }) => {
    await entrarComoAdmin(page, request);
    const id = unico();
    const email = `ui-${id}@correo.com`;

    await page.goto('/app/usuarios.html');
    await expect(page.locator('#titulo')).toHaveText('Gestión de Usuarios');
    await page.fill('#nombre', `UI ${id}`);
    await page.fill('#email', email);
    await page.fill('#password', 'secreto1');
    await page.click('#btn-guardar');
    await expect(page.locator('#mensaje')).toHaveText('Usuario creado correctamente');
    await expect(page.locator('#tabla-usuarios tbody')).toContainText(email);

    await page.fill('#nombre', 'Duplicado');
    await page.fill('#email', email);
    await page.fill('#password', 'secreto1');
    await page.click('#btn-guardar');
    await expect(page.locator('#mensaje')).toContainText('ya está registrado');

    page.once('dialog', (d) => d.accept());
    await page.locator('#tabla-usuarios tbody tr', { hasText: email }).locator('.btn-eliminar').click();
    await expect(page.locator('#mensaje')).toHaveText('Usuario eliminado correctamente');
    await expect(page.locator('#tabla-usuarios tbody')).not.toContainText(email);
  });
});
