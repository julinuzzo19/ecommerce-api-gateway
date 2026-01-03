import type { Request, Response, NextFunction, Router } from 'express';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { config } from '../config/config';
import { logger } from '../utils/logger';

interface LambdaHttpResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

const lambdaClient = new LambdaClient({});

function getRawQueryString(req: Request): string {
  const url = req.originalUrl;
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(idx + 1) : '';
}

function toSingleValueHeaders(
  headers: Request['headers'],
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.join(',');
      continue;
    }
    out[key] = value;
  }

  return out;
}

/**
 * Crea un middleware que traduce una request HTTP (Express) a un evento tipo API Gateway HTTP API v2
 * y ejecuta una Lambda mediante Invoke (sin AWS API Gateway).
 *
 * Seguridad: la autorización “de verdad” es IAM (`lambda:InvokeFunction`). La Lambda sólo recibirá
 * invocaciones del role/credenciales que tenga el gateway.
 */
export function createUsersLambdaProxyHandler() {
  return async function usersLambdaProxyHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const start = Date.now();

    try {
      const rawPath = `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
      const rawQueryString = getRawQueryString(req);

      // Express ya parseó JSON; para mantener compatibilidad con Lambdas que esperan body string,
      // serializamos si viene como objeto.
      const bodyString =
        req.body === undefined || req.body === null
          ? undefined
          : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);

      const event = {
        version: '2.0',
        routeKey: '$default',
        rawPath,
        rawQueryString,
        headers: toSingleValueHeaders(req.headers),
        requestContext: {
          http: {
            method: req.method,
            path: rawPath,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
          },
          requestId: req.headers['x-request-id'],
        },
        body: bodyString,
        isBase64Encoded: false,
      };

      const mode = config.serverless.users.mode;
      if (mode !== 'aws') {
        throw new Error(
          'Users Lambda handler called in non-AWS mode. In offline mode, /users is proxied via http-proxy-middleware.',
        );
      }

      const functionName = config.serverless.users.lambdaFunctionName!;

      const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(event)),
      });

      const response = await lambdaClient.send(command);

      if (!response.Payload) {
        logger.error('Users Lambda returned empty payload', {
          functionName,
        });

        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Users service returned an empty response',
        });
        return;
      }

      const payloadText = new TextDecoder().decode(response.Payload);

      let lambdaHttpResponse: LambdaHttpResponse | undefined;
      try {
        lambdaHttpResponse = JSON.parse(payloadText) as LambdaHttpResponse;
      } catch {
        // Si la lambda devuelve texto “crudo”, lo tratamos como 200.
        lambdaHttpResponse = { statusCode: 200, body: payloadText };
      }

      const statusCode = lambdaHttpResponse.statusCode ?? 200;
      const headers = lambdaHttpResponse.headers ?? {};

      for (const [key, value] of Object.entries(headers)) {
        if (!value) continue;
        // Evitar headers hop-by-hop
        if (key.toLowerCase() === 'transfer-encoding') continue;
        res.setHeader(key, value);
      }

      const durationMs = Date.now() - start;
      logger.info('Users Lambda invoked', {
        mode,
        method: req.method,
        path: rawPath,
        statusCode,
        duration: `${durationMs}ms`,
      });

      if (lambdaHttpResponse.isBase64Encoded && lambdaHttpResponse.body) {
        const buf = Buffer.from(lambdaHttpResponse.body, 'base64');
        res.status(statusCode).send(buf);
        return;
      }

      res.status(statusCode).send(lambdaHttpResponse.body ?? '');
    } catch (error) {
      console.log({ error });
      logger.error('Error invoking Users Lambda', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Dejar que el middleware global maneje el 500 con requestId.
      next(error);
    }
  };
}

/**
 * Registra las rutas `/users/*` que apuntan a la Lambda serverless.
 */
export function registerUsersRoutes(router: Router): void {
  router.use('/users', createUsersLambdaProxyHandler());
}
