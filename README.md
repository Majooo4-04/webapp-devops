# webapp-devops: API REST con pipeline CI/CD

API REST en Node.js (Express + SQLite) con pruebas automatizadas, imagen Docker y despliegue continuo en AWS EC2 mediante GitHub Actions.

## Arquitectura

```
Desarrollador
     |  git push (main)
     v
GitHub ──> GitHub Actions
             |  1. test           (Jest + Supertest, cobertura >= 70%)
             |  2. build-and-push (imagen :latest y :<sha> en Docker Hub)
             |  3. deploy         (SSH a EC2: pull, stop, rm, run)
             v
        Docker Hub ──────────────> AWS EC2 (Ubuntu + Docker)
                                      contenedor webapp-container
                                      puerto 80   -> API REST
                                      puerto 6061 -> servidor de sockets TCP
```

## Tecnologías

- Node.js 22, Express 4, better-sqlite3
- Jest y Supertest (pruebas y cobertura)
- Docker y Docker Hub
- GitHub Actions
- AWS EC2 (Ubuntu Server)

## Endpoints

Formato de respuesta estándar: `{ "statusCode": 200, "data": [] }`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Mensaje de bienvenida |
| GET | `/api/health` | Estado de la API |
| GET | `/api/categorias` | Lista categorías |
| POST | `/api/categorias` | Crea una categoría |
| GET | `/api/productos` | Lista productos con su categoría |
| POST | `/api/productos` | Crea un producto |
| PUT | `/api/productos/:id` | Actualiza precio y/o stock |
| GET | `/api/clientes` | Lista clientes |
| POST | `/api/clientes` | Crea un cliente |
| GET | `/api/pedidos` | Lista pedidos con total calculado |
| POST | `/api/pedidos` | Crea un pedido y descuenta stock |
| POST | `/api/respaldo` | Genera un respaldo de la base de datos |
| GET | `/api/respaldo/descargar` | Genera y descarga un respaldo |
| DELETE | `/api/vaciar` | Vacía todas las tablas |

## Ejecución local

```bash
npm install
npm start
```

La API queda disponible en `http://localhost:3000` (o en el valor de la variable `PORT`).

El servidor de sockets TCP escucha en el puerto `6061` (configurable con la variable `SOCKET_PORT`).

## Pruebas y cobertura

```bash
npm test
```

Ejecuta Jest con cobertura. El umbral mínimo global es de 70% (configurado en `package.json`); si no se cumple, el comando falla y el pipeline se detiene.

## Docker

```bash
docker build -t webapp .
docker run -d --name webapp-container -p 80:80 -p 6061:6061 webapp
```

El archivo `.dockerignore` excluye `node_modules`, `.env`, logs y otros archivos innecesarios.

## Pipeline CI/CD

El archivo `.github/workflows/main.yml` se ejecuta en cada `push` o `pull_request` a `main`:

1. **test**: instala dependencias con `npm ci` y ejecuta las pruebas con cobertura.
2. **build-and-push**: inicia sesión en Docker Hub con un Personal Access Token, construye la imagen y la publica con los tags `latest` y el hash del commit. Solo corre en `push` a `main`.
3. **deploy**: se conecta por SSH a la EC2, descarga la imagen más reciente, detiene y elimina el contenedor anterior y levanta el nuevo mapeado al puerto 80.

## Configuración

### GitHub Secrets

En el repositorio: Settings, Secrets and variables, Actions.

| Secret | Contenido |
|---|---|
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Personal Access Token de Docker Hub |
| `EC2_HOST` | IP pública de la instancia EC2 |
| `EC2_USERNAME` | Usuario SSH (`ubuntu`) |
| `EC2_SSH_KEY` | Contenido completo de la llave `.pem` |

Ningún dato sensible se incluye en el código del repositorio.

### Servidor AWS EC2

1. Crear una instancia Ubuntu Server y un par de llaves `.pem`.
2. Security Group con reglas de entrada: SSH (22) y HTTP (80). El puerto 6061 solo es necesario si se usa el servidor de sockets desde fuera.
3. Instalar Docker y permitir su uso al usuario:

```bash
sudo apt update && sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

4. Verificar el despliegue: `http://<IP_EC2>/api/health`.

## Limitaciones y mejoras futuras

- La base SQLite vive dentro del contenedor, por lo que se reinicia en cada despliegue. Se propone montar un volumen de Docker (`-v webapp-data:/app/data`) para persistirla.

