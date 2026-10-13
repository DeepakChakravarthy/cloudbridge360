import rateLimit from "express-rate-limit";
import helmet from "helmet";

export function applySecurity(app) {
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );

  app.use(
    "/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many auth attempts. Please slow down." },
    }),
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests. Please retry later." },
    }),
  );
}
