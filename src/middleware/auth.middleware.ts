import { Request, Response, NextFunction } from "express";
import axios, { AxiosError } from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { getCachedUser, setCachedUser } from "../utils/auth.cache";
import { UserInfo } from "../types/auth.types";

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Intentar autenticación por x-gateway-secret (servicios internos)
    const gatewaySecret = req.headers["x-gateway-secret"] as string | undefined;

    if (gatewaySecret) {
      if (gatewaySecret === config.security.gatewaySecret) {
        logger.debug("Internal service authentication successful", {
          path: req.path,
          method: req.method,
        });

        req.isInternalService = true;
        next();
        return;
      } else {
        logger.warn("Invalid x-gateway-secret provided", {
          path: req.path,
          method: req.method,
        });
        // No retornamos aún, intentamos con Bearer token
      }
    }

    // 2. Intentar autenticación por Bearer token (usuarios)
    const authHeader = req.headers.authorization;

    console.log({ authHeader });

    if (!authHeader) {
      logger.warn("No authentication method provided", {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        error: "Unauthorized",
        message:
          "Authentication required. Provide either Authorization Bearer token or x-gateway-secret header.",
      });
      return;
    }

    if (!authHeader.startsWith("Bearer ")) {
      logger.warn("Invalid Authorization header format", {
        path: req.path,
        method: req.method,
      });

      res.status(401).json({
        error: "Unauthorized",
        message: "Authorization header must be in format: Bearer <token>",
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // Verificar cache Redis distribuido (5-minute TTL)
    const cached = await getCachedUser(token);

    if (cached) {
      logger.debug("Token found in Redis cache", { userId: cached.id });

      req.headers["x-user-id"] = cached.id;
      req.headers["x-user-email"] = cached.email;
      req.headers["x-user-role"] = cached.role;
      req.headers["x-gateway-secret"] = config.security.gatewaySecret;

      req.user = cached;
      next();
      return;
    }

    // Cache miss — validar con Auth Service
    logger.debug("Token not in cache, validating with Auth Service");

    const response = await axios.get(`${config.services.auth}/auth/validate`, {
      headers: {
        authorization: authHeader,
      },
      timeout: 5000, // Timeout de 5 segundos para evitar bloqueos largos
    });

    // Verificar la respuesta del Auth Service
    if (!response.data.valid) {
      logger.warn("Token validation failed", {
        reason: response.data.error,
        path: req.path,
      });

      res.status(401).json({
        error: "Unauthorized",
        message: response.data.error || "Invalid or expired token",
      });
      return;
    }

    const user: UserInfo = response.data.user;

    // Persistir en Redis para próximas peticiones (distribuido, multi-instancia)
    await setCachedUser(token, user);

    logger.info("Token validated successfully", {
      userId: user.id,
      email: user.email,
      duration: `${Date.now() - startTime}ms`,
    });

    // Setear headers que los microservicios van a leer
    req.headers["x-user-id"] = user.id;
    req.headers["x-user-email"] = user.email;
    req.headers["x-user-role"] = user.role;
    req.headers["x-gateway-secret"] = config.security.gatewaySecret;

    // También adjuntar al objeto request para uso local si es necesario
    req.user = user;

    next();
  } catch (error) {
    const duration = Date.now() - startTime;

    // Manejar diferentes tipos de errores de forma específica
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === "ECONNREFUSED") {
        logger.error("Auth Service is unavailable", {
          url: config.services.auth,
          duration: `${duration}ms`,
        });

        res.status(503).json({
          error: "Service Unavailable",
          message: "Authentication service is temporarily unavailable. Please try again later.",
        });
        return;
      }

      if (axiosError.response?.status === 401) {
        logger.warn("Token rejected by Auth Service", {
          status: axiosError.response.status,
          duration: `${duration}ms`,
        });

        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
        return;
      }

      if (axiosError.code === "ETIMEDOUT" || axiosError.code === "ECONNABORTED") {
        logger.error("Auth Service timeout", {
          duration: `${duration}ms`,
        });

        res.status(504).json({
          error: "Gateway Timeout",
          message: "Authentication service took too long to respond",
        });
        return;
      }
    }

    // Error genérico no manejado específicamente
    logger.error("Unexpected error in auth middleware", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred during authentication",
    });
  }
}
