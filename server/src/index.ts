import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
import express from "express";
import { DATABASE_PATH, DATA_DIR, PORT } from "./config.js";
import { migrate } from "./db/migrate.js";
import { openDatabase } from "./db/pool.js";
import { registerApplicationsRoutes } from "./routes/applications.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerGmailOAuthRoutes } from "./routes/gmailOAuth.js";
import { registerGmailSyncRoutes } from "./routes/gmailSync.js";
import { registerResumesRoutes } from "./routes/resumes.js";

const webDist = path.resolve(__dirname, "../../web/dist");

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = openDatabase(DATABASE_PATH);
migrate(db);

const app = express();
// Resumes upload as base64 JSON (~4/3 file size); allow up to 8 MB files + overhead
app.use(express.json({ limit: "12mb" }));
app.use(
  cors({
    origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
    credentials: true,
  }),
);
//adds api routes for applications, gmail, gmail sync, and resumes
registerAnalyticsRoutes(app, db);
registerApplicationsRoutes(app, db);
registerGmailOAuthRoutes(app, db);
registerGmailSyncRoutes(app, db);
registerResumesRoutes(app, db);

app.get("/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production") {
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/oauth") || req.path === "/health") {
      return next();
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API http://127.0.0.1:${PORT}`);
});
