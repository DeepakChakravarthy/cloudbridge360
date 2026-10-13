import crypto from "node:crypto";
import path from "node:path";
import "dotenv/config";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const dataDir = process.env.DATA_DIR || ".data";
const baseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
const env = process.env.NODE_ENV || "development";
const requiredEnv = [
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SESSION_SECRET",
];

for (const key of requiredEnv) {
  if (env === "production" && !process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const appConfig = {
  env,
  host,
  port,
  baseUrl,
  dataDir: path.resolve(dataDir),
  statePath: path.join(path.resolve(dataDir), "state.json"),
  legacyHistoryPath: process.env.LEGACY_HISTORY_PATH || "migration-history.json",
  sessionSecret:
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  chunkSize: Number(process.env.CHUNK_SIZE || 8 * 1024 * 1024),
  concurrency: Math.max(1, Number(process.env.UPLOAD_CONCURRENCY || 6)),
  minUploadConcurrency: Math.max(1, Number(process.env.MIN_UPLOAD_CONCURRENCY || 2)),
  maxUploadConcurrency: Math.max(
    Number(process.env.MAX_UPLOAD_CONCURRENCY || 12),
    Number(process.env.UPLOAD_CONCURRENCY || 6),
  ),
  maxImageBytesPerFile: Number(process.env.MAX_IMAGE_BYTES_PER_FILE || 200 * 1024 * 1024),
  maxVideoBytesPerFile: Number(process.env.MAX_VIDEO_BYTES_PER_FILE || 20 * 1024 * 1024 * 1024),
  secureCookies: env === "production" || process.env.SECURE_COOKIES === "true",
};
