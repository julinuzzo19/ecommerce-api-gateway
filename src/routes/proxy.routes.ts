import { Router } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  authRateLimiter,
  protectedRateLimiter,
} from '../middleware/rate-limit.middleware';
import { stripSensitiveResponseHeaders } from '../utils/stripSensitiveResponseHeaders';
import { createUsersLambdaProxyHandler } from './users.lambda.routes';

const router = Router();

/** Health check endpoint */
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/** Proxy Authentication */

router.use(
  '/auth',
  authRateLimiter,
  createProxyMiddleware({
    target: config.services.auth,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, _req) => {
      const newPath = `/auth${path}`;
      console.log(`[AUTH] Rewriting: ${path} -> ${newPath}`);
      return newPath;
    },
    on: {
      proxyReq: fixRequestBody, // Fix para reenviar el body correctamente
      proxyRes: (proxyRes, req, res) => {
        stripSensitiveResponseHeaders(proxyRes, req);
      },
    },
  }),
);

/** Proxy Ecommerce */

router.use(
  '/ecommerce',
  authMiddleware,
  protectedRateLimiter,
  createProxyMiddleware({
    target: config.services.ecommerce,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, _req) => {
      const newPath = `${path}`;
      console.log(`[ECOMMERCE] Rewriting: ${path} -> ${newPath}`);
      return newPath;
    },
    on: {
      proxyReq: fixRequestBody, // Fix para reenviar el body correctamente
    },
  }),
);

/** Proxy Inventory */

router.use(
  '/inventory',
  authMiddleware,
  protectedRateLimiter,
  createProxyMiddleware({
    target: config.services.inventory,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, _req) => {
      const newPath = `/inventory${path}`;
      console.log(`[INVENTORY] Rewriting: ${path} -> ${newPath}`);
      return newPath;
    },
    on: {
      proxyReq: fixRequestBody, // Fix para reenviar el body correctamente
    },
  }),
);
/** Proxy Users */

if (config.serverless.users.mode === 'offline') {
  router.use(
    '/users',
    // authMiddleware,
    // protectedRateLimiter,
    createProxyMiddleware({
      target: config.serverless.users.offlineBaseUrl!,
      changeOrigin: true,
      logger: console,
      pathRewrite: (path) => {
        // Cuando el router está montado en /users, `path` llega como '/'
        // pero el serverless-offline expone rutas como '/users'.
        const suffix = path === '/' ? '' : path;

        console.log({suffix})
        return `/users${suffix}`;
      },
      on: {
        proxyReq: fixRequestBody,
        proxyRes: (proxyRes, req) => {
          stripSensitiveResponseHeaders(proxyRes, req);
        },
      },
    }),
  );
} else {
  router.use(
    '/users',
    authMiddleware,
    protectedRateLimiter,
    createUsersLambdaProxyHandler(),
  );
}

// Catch-all para rutas no encontradas (al final)
router.use((req, res) => {
  logger.warn('Route not found', {
    path: req.originalUrl,
    method: req.method,
  });

  res.status(404).json({
    error: 'Not Found',
    message: `El endpoint ${req.method} ${req.originalUrl} no existe`,
  });
});

export default router;
