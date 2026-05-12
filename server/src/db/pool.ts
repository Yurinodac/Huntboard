import Database from "better-sqlite3";

export function openDatabase(filePath: string): Database.Database {
  return new Database(filePath);
}
