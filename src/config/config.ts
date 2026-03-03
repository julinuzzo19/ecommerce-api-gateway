interface ServiceConfig {
  auth: string;
  ecommerce: string;
  inventory: string;
  users?: string;
}

interface ServerlessConfig {
  users: {
    mode: "offline" | "http";
    /** Requerido si mode=offline. Base URL de serverless-offline. */
    offlineBaseUrl?: string;
    /** Requerido si mode=http. Base URL del HTTP API (API Gateway) del servicio Users. */
    httpApiBaseUrl?: string;
    /** Mapping de rutas a funciones en serverless-offline (invocations). */
    functions: {
      createUser: string;
      getUserById: string;
      getUserByEmail: string;
      listUsers: string;
      updateUser: string;
    };
  };
}

interface Config {
  port: number;
  nodeEnv: string;
  services: ServiceConfig;
  serverless: ServerlessConfig;
  security: {
    gatewaySecret: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    auth: {
      windowMs: number;
      maxRequests: number;
    };
    protected: {
      windowMs: number;
      maxRequests: number;
    };
  };
  cors: {
    allowedOrigins: string[];
  };
  logging: {
    level: string;
  };
}

const RATE_LIMIT_DEFAULTS = {
  global: {
    // 15 min / 100 requests
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  },
  auth: {
    // Auth: 15 min / 20 req
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
  },
  protected: {
    // Protegidas: 1 min / 300 req
    windowMs: 60 * 1000,
    maxRequests: 300,
  },
} as const;

function validateConfig(): Config {
  // Lista de variables de entorno requeridas
  const requiredVars = [
    "AUTH_SERVICE_URL",
    "INVENTORY_SERVICE_URL",
    "ECOMMERCE_SERVICE_URL",
    "GATEWAY_SECRET",
    "PORT",
    "NODE_ENV",
  ];

  // Verificar que todas las variables requeridas están presentes
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        `Please check your .env file and ensure all required variables are set.`,
    );
  }

  // Parsear y validar los valores
  const port = parseInt(process.env.PORT || "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`);
  }

  const usersOfflineBaseUrl = process.env.USERS_SERVERLESS_OFFLINE_URL;
  const usersHttpApiBaseUrl = process.env.USERS_HTTP_API_BASE_URL;

  const usersMode: "offline" | "http" = usersOfflineBaseUrl
    ? "offline"
    : usersHttpApiBaseUrl
      ? "http"
      : (() => {
          throw new Error(
            "Missing Users configuration: set USERS_HTTP_API_BASE_URL or USERS_SERVERLESS_OFFLINE_URL in your .env",
          );
        })();

  if (usersMode === "offline" && !usersOfflineBaseUrl) {
    throw new Error(
      "Missing required environment variable: USERS_SERVERLESS_OFFLINE_URL\n" +
        "Set it to the base URL where serverless-offline is listening (e.g. http://localhost:4000).",
    );
  }

  if (usersMode === "http" && !usersHttpApiBaseUrl) {
    throw new Error(
      "Missing required environment variable: USERS_HTTP_API_BASE_URL\n" +
        "Set it to the base URL of the Users HTTP API (e.g. https://<id>.execute-api.<region>.amazonaws.com).",
    );
  }

  // Construir el objeto de configuración con valores validados
  return {
    port,
    nodeEnv: process.env.NODE_ENV || "development",
    services: {
      auth: process.env.AUTH_SERVICE_URL!,
      ecommerce: process.env.ECOMMERCE_SERVICE_URL!,
      inventory: process.env.INVENTORY_SERVICE_URL!,
      // Mantener opcional por compatibilidad si aún se usa un Users HTTP service.
      users: process.env.USER_SERVICE_URL,
    },
    serverless: {
      users: {
        mode: usersMode,
        offlineBaseUrl: usersOfflineBaseUrl,
        httpApiBaseUrl: usersHttpApiBaseUrl,
        functions: {
          createUser: process.env.USERS_FN_CREATE_USER || "createUser",
          getUserById: process.env.USERS_FN_GET_USER_BY_ID || "getUserById",
          getUserByEmail: process.env.USERS_FN_GET_USER_BY_EMAIL || "getUserByEmail",
          listUsers: process.env.USERS_FN_LIST_USERS || "listUsers",
          updateUser: process.env.USERS_FN_UPDATE_USER || "updateUser",
        },
      },
    },
    security: {
      gatewaySecret: process.env.GATEWAY_SECRET!,
    },
    rateLimit: {
      windowMs: RATE_LIMIT_DEFAULTS.global.windowMs,
      maxRequests: RATE_LIMIT_DEFAULTS.global.maxRequests,
      auth: {
        windowMs: RATE_LIMIT_DEFAULTS.auth.windowMs,
        maxRequests: RATE_LIMIT_DEFAULTS.auth.maxRequests,
      },
      protected: {
        windowMs: RATE_LIMIT_DEFAULTS.protected.windowMs,
        maxRequests: RATE_LIMIT_DEFAULTS.protected.maxRequests,
      },
    },
    cors: {
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    },
    logging: {
      level: process.env.LOG_LEVEL || "info",
    },
  };
}

// Exportar la configuración validada como constante
// Si falla la validación, el proceso se detiene inmediatamente
export const config = validateConfig();

// Logging de la configuración al iniciar (sin mostrar secrets)
console.log("API Gateway Configuration:", {
  port: config.port,
  nodeEnv: config.nodeEnv,
  services: config.services,
  cors: config.cors,
});
