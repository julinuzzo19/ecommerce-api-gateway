import Redis from "ioredis";
import { logger } from "../utils/logger";

// ─── Parámetros de retry ──────────────────────────────────────────────────────
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 200;
const MAX_DELAY_MS = 30_000;

function backoffDelay(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  const jitter = exp * 0.1 * (Math.random() * 2 - 1);
  return Math.round(exp + jitter);
}

// ─── Cliente Redis ────────────────────────────────────────────────────────────

const host = process.env.REDIS_HOST ?? "localhost";
const port = parseInt(process.env.REDIS_PORT ?? "6379", 10);

/**
 * retryStrategy cubre tanto la primera conexión como reconexiones en runtime.
 * Con lazyConnect=true ioredis no conecta al instanciar — se dispara al llamar
 * redisClient.connect(). A partir de ahí, cualquier caída usa este mismo retry.
 */
export const redisClient = new Redis({
  host,
  port,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(attempt: number): number | null {
    if (attempt >= MAX_RETRIES) {
      logger.error(`[Redis] Máximo de reintentos alcanzado (${MAX_RETRIES}). Sin más reconexiones.`);
      return null;
    }
    const delay = backoffDelay(attempt);
    logger.warn(`[Redis] Reintento #${attempt + 1}/${MAX_RETRIES} en ${delay} ms…`);
    return delay;
  },
});

// ─── Eventos de ciclo de vida ─────────────────────────────────────────────────

redisClient.on("connect", () => logger.info(`[Redis] Conectado a ${host}:${port}`));
redisClient.on("ready", () => logger.info("[Redis] Cliente listo para recibir comandos"));
redisClient.on("error", (err: Error) => logger.error(`[Redis] Error: ${err.message}`));
redisClient.on("close", () => logger.warn("[Redis] Conexión cerrada"));
redisClient.on("reconnecting", (delay: number) => logger.warn(`[Redis] Reconectando en ${delay} ms…`));
redisClient.on("end", () => logger.error("[Redis] Conexión terminada definitivamente (sin más reintentos)"));

// ─── API de ciclo de vida ─────────────────────────────────────────────────────

/**
 * Inicia la conexión y espera a que Redis esté ready (o falle definitivamente).
 * El retry de la primera conexión y de reconexiones posteriores lo maneja
 * retryStrategy de forma unificada — no hay loop manual aquí.
 *
 * No lanza — el gateway arranca en modo degradado si Redis no está disponible.
 */
export async function connectRedis(): Promise<void> {
  await new Promise<void>((resolve) => {
    redisClient.once("ready", () => {
      logger.info("[Redis] Primera conexión establecida exitosamente");
      resolve();
    });

    redisClient.once("end", () => {
      logger.error("[Redis] No se pudo conectar. Arrancando en modo degradado (sin caché distribuido).");
      resolve(); // no lanzamos — Redis es opcional
    });

    redisClient.connect().catch(() => {
      // El error real llega por el evento "end" cuando se agotan los reintentos.
      // Este catch solo evita el UnhandledPromiseRejection.
    });
  });
}

/**
 * Cierra la conexión de forma ordenada durante el shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    await redisClient.quit();
    logger.info("[Redis] Conexión cerrada correctamente");
  } catch (err) {
    logger.error("[Redis] Error al cerrar la conexión", { error: (err as Error).message });
  }
}
