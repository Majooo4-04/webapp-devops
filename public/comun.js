// Utilidades compartidas por todas las pantallas: sesión, llamadas a la API y navegación.
const Sesion = {
  token: () => localStorage.getItem('token'),
  usuario: () => {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { return null; }
  },
  guardar(token, usuario) {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  },
  cerrar() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    location.href = '/app/login.html';
  },
};

async function api(ruta, opciones = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (Sesion.token()) headers.Authorization = `Bearer ${Sesion.token()}`;
  const cuerpo = opciones.body !== undefined && typeof opciones.body !== 'string' ? JSON.stringify(opciones.body) : opciones.body;
  const res = await fetch(ruta, { ...opciones, headers, body: cuerpo });
  const json = await res.json();
  if (res.status === 401 && !location.pathname.endsWith('login.html')) Sesion.cerrar();
  return json;
}

function exigirSesion() {
  if (!Sesion.token()) location.href = '/app/login.html';
}

function pintarNavegacion() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const usuario = Sesion.usuario();
  const enlaces = [['Categorías', '/app/'], ['Productos', '/app/productos.html']];
  if (usuario && usuario.rol === 'admin') enlaces.push(['Usuarios', '/app/usuarios.html']);
  nav.replaceChildren();
  enlaces.forEach(([texto, href]) => {
    const a = document.createElement('a');
    a.textContent = texto;
    a.href = href;
    nav.appendChild(a);
  });
  const espacio = document.createElement('span');
  espacio.className = 'espacio';
  const quien = document.createElement('span');
  quien.className = 'quien';
  quien.id = 'usuario-actual';
  quien.textContent = usuario ? `${usuario.nombre} (${usuario.rol})` : '';
  const salir = document.createElement('button');
  salir.id = 'btn-salir';
  salir.className = 'secundario chico';
  salir.type = 'button';
  salir.textContent = 'Cerrar sesión';
  salir.addEventListener('click', () => Sesion.cerrar());
  nav.append(espacio, quien, salir);
}

function mostrarMensaje(elemento, texto, tipo) {
  elemento.textContent = texto;
  elemento.className = `mensaje ${tipo}`;
}
