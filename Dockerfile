# Imagen base con Node.js 22
FROM node:22-slim

# Herramientas de compilación necesarias para better-sqlite3
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Instalar dependencias (se copian primero para aprovechar la caché de Docker)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el código de la aplicación
COPY . .

# La app escucha en el puerto 80 dentro del contenedor
ENV PORT=80
ENV DATA_DIR=/app/data

EXPOSE 80 6061

CMD ["node", "index.js"]