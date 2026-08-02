import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

export type SqliteDatabase = InstanceType<typeof Database>;

export function defaultDatabasePath(): string {
  return fileURLToPath(new URL("../../var/db/expression-training.sqlite", import.meta.url));
}

export function openDatabase(filename = defaultDatabasePath()): SqliteDatabase {
  mkdirSync(dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  migrateDatabase(database);
  return database;
}

export function migrateDatabase(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (database.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: number }>).map(
      ({ id }) => id,
    ),
  );

  const applyMigration = database.transaction((id: number, name: string, sql: string) => {
    database.exec(sql);
    database
      .prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)")
      .run(id, name, new Date().toISOString());
  });

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.id)) {
      applyMigration(migration.id, migration.name, migration.sql);
    }
  }
}
