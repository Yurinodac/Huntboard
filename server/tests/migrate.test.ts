import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";

describe("migrate", () => {
  it("creates applications and status history tables", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-"));
    const dbPath = path.join(dir, "t.db");
    const db = openDatabase(dbPath);
    migrate(db);
    const apps = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
      )
      .get();
    const history = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='application_status_history'",
      )
      .get();
    expect(apps).toBeTruthy();
    expect(history).toBeTruthy();
  });
});
