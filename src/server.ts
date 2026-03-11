import http from "http";
import { App } from "./app";
import { config } from "./config/config";
import { logger } from "./utils/logger";
import { connectRedis, disconnectRedis } from "./config/redis";

/**
 * Servidor principal del API Gateway.
 * Gestiona el ciclo de vida completo: inicialización, ejecución y cierre limpio.
 */
class Server {
  private readonly app: App;
  private httpServer!: http.Server;
  private isShuttingDown = false;

  constructor() {
    this.app = new App();
    this.setupGracefulShutdown();
  }

  private async initializeRedis(): Promise<void> {
    await connectRedis();
  }

  private async closeResources(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.warn("[Server] Cerrando recursos...");

    await disconnectRedis();

    logger.info("[Server] Recursos cerrados correctamente");
  }

  private setupGracefulShutdown(): void {
    process.on("uncaughtException", (error: Error) => {
      logger.error("[Server] Uncaught exception", { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logger.error("[Server] Unhandled rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.warn(`[Server] ${signal} recibido — iniciando shutdown graceful`);
      try {
        await new Promise<void>((resolve, reject) =>
          this.httpServer.close((err) => (err ? reject(err) : resolve())),
        );
        await this.closeResources();
        process.exit(0);
      } catch (error) {
        logger.error("[Server] Error durante el shutdown", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  public async listen(): Promise<void> {
    try {
      await this.initializeRedis();

      this.httpServer = http.createServer(this.app.getApp());

      this.httpServer.listen(config.port, () => {
        logger.info("[Server] API Gateway iniciado correctamente", {
          port: config.port,
          environment: config.nodeEnv,
          services: {
            auth: config.services.auth,
            ecommerce: config.services.ecommerce,
            inventory: config.services.inventory,
            users: config.services.users,
          },
        });
      });

      this.httpServer.on("error", (error: Error) => {
        logger.error("[Server] Error crítico en el servidor HTTP", {
          error: error.message,
          stack: error.stack,
        });
        process.exit(1);
      });
    } catch (error) {
      logger.error("[Server] Fallo al iniciar el servidor", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }
}

const server = new Server();
server.listen();
