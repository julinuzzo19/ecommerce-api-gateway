import { redisClient } from "../config/redis";
import { logger } from "./logger";
import { UserInfo } from "../types/auth.types";

export const TOKEN_CACHE_TTL_SECONDS = 5 * 60; // 5 minutos

/**
 * Obtiene el usuario cacheado en Redis para un token dado.
 * Si Redis no está disponible devuelve null (fallback silencioso al Auth Service).
 */
export async function getCachedUser(token: string): Promise<UserInfo | null> {
  try {
    const raw = await redisClient.get(`token:${token}`);
    if (!raw) return null;
    return JSON.parse(raw) as UserInfo;
  } catch (err) {
    logger.warn("[auth.cache] Error al leer cache Redis — continuando sin cache", {
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Guarda el usuario en Redis con TTL.
 * Si Redis no está disponible el error se absorbe y el middleware sigue funcionando.
 */
export async function setCachedUser(token: string, user: UserInfo): Promise<void> {
  try {
    await redisClient.setex(`token:${token}`, TOKEN_CACHE_TTL_SECONDS, JSON.stringify(user));
  } catch (err) {
    logger.warn("[auth.cache] Error al escribir cache Redis — el token no quedará cacheado", {
      error: (err as Error).message,
    });
  }
}
