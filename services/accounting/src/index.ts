import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { errorMiddleware } from "./middleware/error";
import router from "./routes";

// Limit: 300 req/min por IP — suficiente para el proxy Next.js en producción
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests" },
});

function resolveAllowedOrigin(): string | null {
  const configuredOrigin = process.env.ALLOWED_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  return process.env.NODE_ENV === "development" ? "*" : null;
}

export function createApp(): express.Application {
  const app = express();

  // Cabeceras de seguridad HTTP
  app.use(helmet());

  // CORS manual — solo se permiten requests desde el proxy Next.js
  // En desarrollo se acepta cualquier origen para facilitar el debug local.
  const allowedOrigin = resolveAllowedOrigin();

  app.use((_req, res, next) => {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Service-Token"
    );
    next();
  });

  // Rate limiting — antes de parsear body para rechazar temprano
  app.use(limiter);

  // Parsear JSON en el body
  app.use(express.json({ limit: "1mb" }));

  // Todas las rutas bajo /
  app.use("/", router);

  // Error handler — debe ir último
  app.use(errorMiddleware);

  return app;
}
