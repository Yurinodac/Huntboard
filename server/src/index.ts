import cors from "cors";
import express from "express";
import { PORT } from "./config.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
    credentials: true,
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API http://127.0.0.1:${PORT}`);
});
