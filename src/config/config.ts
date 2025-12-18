interface ServiceConfig {
  auth: string;
  ecommerce: string;
  inventory: string;
  users: string;
}

interface Config {
  port: number;
  nodeEnv: string;
  services: ServiceConfig;
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
    'AUTH_SERVICE_URL',
    'INVENTORY_SERVICE_URL',
    'USER_SERVICE_URL',
    'ECOMMERCE_SERVICE_URL',
    'GATEWAY_SECRET',
    'PORT',
    'NODE_ENV',
  ];

  // Verificar que todas las variables requeridas están presentes
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        `Please check your .env file and ensure all required variables are set.`,
    );
  }

  // Parsear y validar los valores
  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`,
    );
  }

  // Construir el objeto de configuración con valores validados
  return {
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    services: {
      auth: process.env.AUTH_SERVICE_URL!,
      ecommerce: process.env.ECOMMERCE_SERVICE_URL!,
      inventory: process.env.INVENTORY_SERVICE_URL!,
      users: process.env.USER_SERVICE_URL!,
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
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
      ],
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
  };
}

// Exportar la configuración validada como constante
// Si falla la validación, el proceso se detiene inmediatamente
export const config = validateConfig();

// Logging de la configuración al iniciar (sin mostrar secrets)
console.log('API Gateway Configuration:', {
  port: config.port,
  nodeEnv: config.nodeEnv,
  services: config.services,
  cors: config.cors,
});
