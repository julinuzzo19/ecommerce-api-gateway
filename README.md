# API Gateway 🚀

API Gateway centralizado que gestiona y redirige peticiones a los microservicios de autenticación, ecommerce e inventario.

## 📋 Características

- ✅ Enrutamiento inteligente a microservicios
- ✅ Autenticación y autorización centralizada con JWT
- ✅ Rate limiting para prevenir abuso
- ✅ CORS configurable
- ✅ Logging detallado de todas las peticiones
- ✅ Caché de tokens para mejor rendimiento
- ✅ Manejo robusto de errores
- ✅ Health checks
- ✅ Seguridad con Helmet.js

## 🏗️ Arquitectura

```
Cliente
   ↓
API Gateway (Puerto 3000)
   ↓
   ├─→ Auth Service - Rutas públicas: /auth/*
   ├─→ Ecommerce Service - Rutas protegidas: /ecommerce/*
   └─→ Inventory Service - Rutas protegidas: /inventory/*
   └─→ User Service - Rutas protegidas: /users/*
```

## 🚀 Inicio Rápido

### 1. Clonar e instalar dependencias

```bash
git clone <tu-repo>
cd api_gateway
npm install
```

### 2. Configurar variables de entorno

Copia el archivo `.env.example` a `.env` y configura tus valores:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones:

```env
PORT=3000
NODE_ENV=development
AUTH_SERVICE_URL=http://localhost:3001
ECOMMERCE_SERVICE_URL=http://localhost:3002
GATEWAY_SECRET=tu_secreto_super_seguro_aqui
JWT_SECRET=tu_jwt_secret_super_seguro_aqui
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

### 4. Compilar para producción

```bash
npm run build
npm start
```

## 📚 Rutas Disponibles

### Rutas Públicas (Sin autenticación)

| Método | Ruta                    | Descripción                         |
| ------ | ----------------------- | ----------------------------------- |
| GET    | `/health`               | Health check del gateway            |
| POST   | `/auth/login`           | Iniciar sesión                      |
| POST   | `/auth/register`        | Registrar nuevo usuario             |
| POST   | `/auth/forgot-password` | Recuperar contraseña                |
| \*     | `/auth/*`               | Cualquier ruta del servicio de auth |

### Rutas Protegidas (Requieren autenticación)

| Método | Ruta           | Descripción                            |
| ------ | -------------- | -------------------------------------- |
| \*     | `/ecommerce/*` | Todas las rutas del servicio ecommerce |
| \*     | `/inventory/*` | Todas las rutas del servicio inventario |
| \*     | `/users/*` | Todas las rutas del servicio usuarios |

**Nota:** Para acceder a rutas protegidas, incluye el header:

```
Authorization: Bearer <tu_token_jwt>
```

## 🔐 Autenticación

El gateway valida tokens JWT en las rutas protegidas:

1. El cliente envía el token en el header `Authorization: Bearer <token>`
2. El gateway valida el token con el servicio de autenticación
3. Si es válido, el gateway añade headers especiales y reenvía la petición:
   - `x-user-id`: ID del usuario
   - `x-user-email`: Email del usuario
   - `x-user-roles`: Roles del usuario
   - `x-gateway-secret`: Secreto para validar que viene del gateway

Los microservicios pueden confiar en estos headers para identificar al usuario.

## 📝 Ejemplos de Uso

### Login (Público)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@ejemplo.com",
    "password": "password123"
  }'
```

### Acceder a ruta protegida

```bash
curl -X GET http://localhost:3000/ecommerce/productos \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## ⚙️ Configuración Avanzada

### Rate Limiting

Por defecto permite 100 peticiones cada 15 minutos por IP. Configurable en `.env`:

```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### CORS

Configura los orígenes permitidos en `.env`:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://tu-frontend.com
```

## 🛠️ Tecnologías

- **Node.js** + **TypeScript**
- **Express** - Framework web
- **http-proxy-middleware** - Proxy a microservicios
- **axios** - Cliente HTTP para validar tokens
- **winston** - Logging profesional
- **helmet** - Seguridad HTTP
- **express-rate-limit** - Limitación de peticiones
- **cors** - Control de CORS

## 📁 Estructura del Proyecto

```
api_gateway/
├── src/
│   ├── app.ts                    # Configuración de Express
│   ├── server.ts                 # Punto de entrada
│   ├── config/
│   │   └── config.ts             # Configuración centralizada
│   ├── middleware/
│   │   ├── auth.middleware.ts    # Validación de JWT
│   │   └── request.logger.middleware.ts
│   ├── routes/
│   │   └── proxy.routes.ts       # Rutas y configuración de proxy
│   ├── types/
│   │   └── index.ts              # Tipos TypeScript
│   └── utils/
│       └── logger.ts             # Logger de Winston
├── .env                          # Variables de entorno (no commitear)
├── .env.example                  # Plantilla de variables
├── package.json
└── tsconfig.json
```
