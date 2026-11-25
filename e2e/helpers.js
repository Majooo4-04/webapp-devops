const ADMIN = { email: 'admin@webapp.com', password: 'Admin#2026' };

// Inicia sesión por API y devuelve { token, usuario }
async function sesionApi(request, credenciales = ADMIN) {
  const res = await request.post('/api/login', { data: credenciales });
  return (await res.json()).data[0];
}

const cabeceras = (token) => ({ Authorization: `Bearer ${token}` });

// Deja la sesión iniciada en el navegador (equivale a haber hecho login en la pantalla)
async function entrarComoAdmin(page, request) {
  const { token, usuario } = await sesionApi(request);
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('usuario', JSON.stringify(u));
  }, [token, usuario]);
}

module.exports = { ADMIN, sesionApi, cabeceras, entrarComoAdmin };
