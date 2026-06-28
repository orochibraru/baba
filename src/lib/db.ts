import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { config } from "../config";

let db: Database | undefined;

function initDbPath(path: string): void {
	// If the source dir of the db doesn't exist, create it
	const dir = path.replace(/\/[^/]*$/, "");
	mkdirSync(dir, { recursive: true });
}

export function initDb(): Database {
	initDbPath(config.database.path);
	db = new Database(config.database.path, { create: true });
	db.run("PRAGMA journal_mode = WAL;");
	db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      metric      TEXT    NOT NULL,
      volume      TEXT,
      started_at  INTEGER NOT NULL,
      resolved_at INTEGER,
      peak_value  REAL    NOT NULL,
      threshold   REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id),
      sent_at     INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      succeeded   INTEGER NOT NULL
    );
  `);
	return db;
}

export function getDb(): Database {
	if (!db) throw new Error("Database not initialized — call initDb() first");
	return db;
}
