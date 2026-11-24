const { test, expect } = require('@playwright/test');

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('Interfaz web (E2E con Playwright)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/');
  });

  test('muestra el título y el estado de la API', async ({ page }) => {
    await expect(page.locator('#titulo')).toHaveText('Panel de Categorías');
    await expect(page.locator('#estado-api')).toHaveText('Listo');
  });

  test('el botón de agregar es visible y tiene el texto correcto', async ({ page }) => {
    await expect(page.locator('#btn-agregar')).toBeVisible();
    await expect(page.locator('#btn-agregar')).toHaveText('Agregar categoría');
  });

  test('agrega una categoría desde el formulario y aparece en la tabla', async ({ page }) => {
    const nombre = `UI-${unico()}`;
    await page.fill('#nombre', nombre);
    await page.click('#btn-agregar');

    await expect(page.locator('#mensaje')).toHaveText('Categoría creada correctamente');
    await expect(page.locator('#tabla-categorias tbody')).toContainText(nombre);
  });

  test('enviar el formulario vacío muestra un mensaje de error', async ({ page }) => {
    await page.click('#btn-agregar');
    await expect(page.locator('#mensaje')).toContainText('obligatorio');
    await expect(page.locator('#mensaje')).toHaveClass(/error/);
  });
});
