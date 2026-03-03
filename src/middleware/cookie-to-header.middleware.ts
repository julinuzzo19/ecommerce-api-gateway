import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Middleware que transforma el access_token de cookie a header Authorization
 * Se ejecuta antes del authMiddleware para normalizar la autenticación
 */
export function cookieToHeaderMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Si ya existe el header Authorization, no hacemos nada
  if (req.headers.authorization) {
    next();
    return;
  }

  // Buscar el access_token en las cookies
  const accessToken = req.cookies?.access_token;

  if (accessToken) {
    // Transformar cookie a header Authorization: Bearer
    req.headers.authorization = `Bearer ${accessToken}`;

    logger.debug("Transformed cookie to Authorization header", {
      path: req.path,
      method: req.method,
    });
  }

  next();
}
