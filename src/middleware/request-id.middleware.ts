import { Request, Response, NextFunction } from 'express';

/**
 * Genera un ID único por petición y lo propaga vía `x-request-id`.
 *
 * Útil para correlación de logs y para respuestas de error (incluyendo 429).
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Middleware que garantiza que cada request tenga `x-request-id`.
 */
export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.headers['x-request-id'] = requestId;
  next();
}
