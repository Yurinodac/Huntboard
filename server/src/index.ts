import cors from "cors";
import express from "express";
import { config } from "./config.js";

const app = express();

const localhostOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({ origin: localhostOriginRegex }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.listen(config.PORT, "127.0.0.1", () => {
  console.log(`listening on http://127.0.0.1:${config.PORT}`);
});
