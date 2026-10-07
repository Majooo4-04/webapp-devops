const net = require('net');

// Cambia estos valores según lo que quieras probar
const HOST = '18.191.166.143';
const PORT =  6061;


const comandos = [
  '{insert:{"nombre":"Universidad"}}',
  '{get:all}',
  '{get:1}',
  '{comando_invalido:1}'
];

const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`Conectado a ${HOST}:${PORT}\n`);
  enviarSiguiente();
});

let index = 0;

function enviarSiguiente() {
  if (index >= comandos.length) {
    client.end();
    return;
  }
  const comando = comandos[index];
  console.log('>> Enviando:', comando);
  client.write(comando + '\n');
  index++;
}

client.on('data', (data) => {
  console.log('<< Respuesta:', data.toString().trim(), '\n');
  enviarSiguiente();
});

client.on('close', () => {
  console.log('Conexión cerrada.');
});

client.on('error', (err) => {
  console.error('Error de conexión:', err.message);
});