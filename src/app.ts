import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/config";
import { logger } from "./utils/logger";
import proxyRoutes from "./routes/proxy.routes";
import { requestLoggerMiddleware } from "./middleware/request.logger.middleware";
import { cookieToHeaderMiddleware } from "./middleware/cookie-to-header.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { globalRateLimiter } from "./middleware/rate-limit.middleware";

export class App {
  private app: Application;
  private readonly host: string =
    process.env.NODE_ENV === "production" ? process.env.HOST || "0.0.0.0" : "0.0.0.0";

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

  private initializeProxyTrust(): void {
    if (config.nodeEnv === "production") {
      this.app.set("trust proxy", 1);
    }
  }

  private initializeSecurityMiddleware(): void {
    this.app.use(
      helmet({
        contentSecurityPolicy: config.nodeEnv === "production",
        crossOriginEmbedderPolicy: false,
      }),
    );

    this.app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin && config.nodeEnv === "development") {
            return callback(null, true);
          }
          if (!origin || config.cors.allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn("CORS blocked request", { origin });
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      }),
    );
  }

  private initializeRequestIdMiddleware(): void {
    this.app.use(requestIdMiddleware);
  }

  private initializeRateLimitingMiddleware(): void {
    this.app.use(globalRateLimiter);
  }

  private initializeParsingMiddleware(): void {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  }

  private initializeCookieMiddleware(): void {
    this.app.use(cookieParser());
    this.app.use(cookieToHeaderMiddleware);
  }

  private initializeLoggingMiddleware(): void {
    this.app.use(requestLoggerMiddleware);
  }

  private initializeRoutes(): void {
    this.app.use("/", proxyRoutes);
  }

  private initializeErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error("Unhandled error", {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        requestId: req.headers["x-request-id"],
      });

      const message = config.nodeEnv === "production" ? "An internal server error occurred" : err.message;

      res.status(500).json({
        error: "Internal Server Error",
        message,
        requestId: req.headers["x-request-id"],
      });
    });
  }

  public getApp(): Application {
    return this.app;
  }
}
