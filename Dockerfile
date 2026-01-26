# Optimizado para Astro con servidor Node.js

# Etapa 1: Build
FROM node:20-alpine AS builder

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache libc6-compat

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar dependencias (incluidas dev para el build)
RUN npm ci

# Copiar código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Etapa 2: Producción
FROM node:20-alpine AS runner

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache libc6-compat

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 astro

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiar build desde la etapa anterior
COPY --from=builder --chown=astro:nodejs /app/dist ./dist

# Cambiar al usuario no-root
USER astro

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Comando de inicio
CMD ["node", "./dist/server/entry.mjs"]
