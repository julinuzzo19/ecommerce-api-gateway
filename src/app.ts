import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/config';
import { logger } from './utils/logger';
import proxyRoutes from './routes/proxy.routes';
import { requestLoggerMiddleware } from './middleware/request.logger.middleware';
import { cookieToHeaderMiddleware } from './middleware/cookie-to-header.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { globalRateLimiter } from './middleware/rate-limit.middleware';

export class App {
  private app: Application;
  private host: string =
    process.env.NODE_ENV === 'production'
      ? process.env.HOST || '0.0.0.0'
      : '0.0.0.0';

  constructor() {
    this.app = express();
    this.initializeProxyTrust();
    this.initializeSecurityMiddleware();
    this.initializeRequestIdMiddleware();
    this.initializeRateLimitingMiddleware();
    this.initializeParsingMiddleware();
    this.initializeCookieMiddleware();
    this.initializeLoggingMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeSecurityMiddleware(): void {
    // Helmet agrega varios headers de seguridad HTTP
    this.app.use(
      helmet({
        // Configuración personalizada de helmet
        contentSecurityPolicy: config.nodeEnv === 'production',
        crossOriginEmbedderPolicy: false,
      }),
    );

    // CORS - Configurar qué dominios pueden acceder a nuestra API
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Permitir peticiones sin origin (como Postman, curl, etc.) en desarrollo
          if (!origin && config.nodeEnv === 'development') {
            return callback(null, true);
          }

          // Verificar si el origin está en la lista permitida
          if (!origin || config.cors.allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn('CORS blocked request', { origin });
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true, // Permitir cookies y headers de autenticación
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      }),
    );

    // Nota: el rate limiting se inicializa en un middleware dedicado para poder
    // inyectar `x-request-id` antes y reutilizar limiters por ruta.
  }

  private initializeProxyTrust(): void {
    // Si el gateway está detrás de un proxy (Nginx/Ingress/ALB), en producción
    // necesitamos confiar en el primer proxy para que `req.ip` sea correcto.
    if (config.nodeEnv === 'production') {
      this.app.set('trust proxy', 1);
    }
  }

  private initializeRequestIdMiddleware(): void {
    this.app.use(requestIdMiddleware);
  }

  private initializeRateLimitingMiddleware(): void {
    this.app.use(globalRateLimiter);
  }

  private initializeParsingMiddleware(): void {
    // Parsear JSON bodies (con límite de tamaño para prevenir ataques)
    this.app.use(express.json({ limit: '10mb' }));

    // Parsear URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private initializeCookieMiddleware(): void {
    // Parsear cookies
    this.app.use(cookieParser());

    // Transformar access_token de cookie a header Authorization
    this.app.use(cookieToHeaderMiddleware);
  }

  private initializeLoggingMiddleware(): void {
    this.app.use(requestLoggerMiddleware);
  }

  private initializeRoutes(): void {
    // Todas las rutas están definidas en proxy.routes.ts
    this.app.use('/', proxyRoutes);
  }

  private initializeErrorHandling(): void {
    // Este middleware captura cualquier error que no fue manejado antes
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error('Unhandled error', {
          error: err.message,
          stack: err.stack,
          path: req.path,
          method: req.method,
          requestId: req.headers['x-request-id'],
        });

        // No exponer detalles del error en producción
        const message =
          config.nodeEnv === 'production'
            ? 'An internal server error occurred'
            : err.message;

        res.status(500).json({
          error: 'Internal Server Error',
          message,
          requestId: req.headers['x-request-id'],
        });
      },
    );
  }

  public listen(port: number, callback?: () => void): void {
    this.app.listen(port, this.host, callback);
  }
}
