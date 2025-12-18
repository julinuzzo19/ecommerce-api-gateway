import rateLimit, {
  type RateLimitRequestHandler,
  type Options,
  ipKeyGenerator,
} from 'express-rate-limit';
import { config } from '../config/config';
import { logger } from '../utils/logger';

/**
 * Normaliza la IP del cliente con un fallback seguro.
 */
function getClientIp(
  req: Parameters<NonNullable<Options['keyGenerator']>>[0],
): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Devuelve el `x-request-id` ya normalizado (o un fallback).
 */
function getRequestIdFromHeaders(headers: Record<string, unknown>): string {
  const value = headers['x-request-id'];
  return typeof value === 'string' && value.length > 0 ? value : 'unknown';
}

/**
 * Crea un rate limiter con handler consistente para el API Gateway.
 */
function createRateLimiter(options: Partial<Options>): RateLimitRequestHandler {
  return rateLimit({ 
    ...options,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfterSeconds = Math.ceil(
        ((options.windowMs ?? 0) as number) / 1000,
      );

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
        requestId: getRequestIdFromHeaders(
          req.headers as Record<string, unknown>,
        ),
      });

      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
      }

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'You have exceeded the rate limit. Please try again later.',
        retryAfter: retryAfterSeconds,
        requestId: getRequestIdFromHeaders(
          req.headers as Record<string, unknown>,
        ),
      });
    },
  });
}

/**
 * Limiter global (IP-based) para proteger infraestructura.
 * Recomendación: mantenerlo relativamente alto y combinarlo con limiters más
 * estrictos por ruta.
 */
export const globalRateLimiter: RateLimitRequestHandler = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxRequests,
  keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
  skip: (req) => req.path === '/health',
});

/**
 * Limiter específico para endpoints de autenticación.
 * Más estricto para mitigar fuerza bruta.
 */
export const authRateLimiter: RateLimitRequestHandler = createRateLimiter({
  windowMs: config.rateLimit.auth.windowMs,
  limit: config.rateLimit.auth.maxRequests,
  keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
});

/**
 * Limiter para rutas protegidas.
 * Si existe `req.user`, limita por usuario para evitar penalizar NATs.
 */
export const protectedRateLimiter: RateLimitRequestHandler = createRateLimiter({
  windowMs: config.rateLimit.protected.windowMs,
  limit: config.rateLimit.protected.maxRequests,
  keyGenerator: (req) => {
    if (req.user?.id) return `user:${req.user.id}`;
    return ipKeyGenerator(getClientIp(req));
  },
});
