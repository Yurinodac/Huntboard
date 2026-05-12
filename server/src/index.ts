import fs from "node:fs";
import cors from "cors";
import express from "express";
import { DATABASE_PATH, DATA_DIR, PORT } from "./config.js";
import { migrate } from "./db/migrate.js";
import { openDatabase } from "./db/pool.js";
import { registerApplicationsRoutes } from "./routes/applications.js";

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = openDatabase(DATABASE_PATH);
migrate(db);

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
    credentials: true,
  }),
);

registerApplicationsRoutes(app, db);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API http://127.0.0.1:${PORT}`);
});
