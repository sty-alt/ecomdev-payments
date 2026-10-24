import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations.js';

export type DB = Database.Database;

/**
 * Открывает SQLite-базу и применяет миграции.
 * Путь ':memory:' даёт изолированную базу в памяти — так работают тесты.
 */
export function openDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Встроенные lower()/LIKE в SQLite понимают регистр только для латиницы.
  db.function('ulower', { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? value.toLocaleLowerCase('ru-RU') : value,
  );

  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const apply = db.transaction(() => {
    for (let version = current; version < migrations.length; version++) {
      db.exec(migrations[version]!);
      db.pragma(`user_version = ${version + 1}`);
    }
  });
  apply();
}
