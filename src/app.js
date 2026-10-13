import express from "express";
import session from "express-session";
import authRoutes from "./routes/auth.routes.js";
import callbackRoutes from "./routes/callback.routes.js";
import apiRoutes from "./routes/api.routes.js";
import { appConfig } from "./config/env.js";
import { initializeState } from "./data/stateStore.js";
import { applySecurity } from "./middleware/security.js";

export async function createApp() {
  await initializeState();

  const app = express();
  app.set("trust proxy", false);

  app.use(express.json({ limit: "32kb" }));
  app.use(
    session({
      secret: appConfig.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: appConfig.secureCookies,
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  applySecurity(app);
  app.use(express.static("public"));
  app.use("/api", apiRoutes);
  app.use("/auth", authRoutes);
  app.use("/callback", callbackRoutes);

  return app;
}

export default createApp;
