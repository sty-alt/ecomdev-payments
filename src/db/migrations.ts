/**
 * Миграции применяются по порядку; номер последней хранится в PRAGMA user_version.
 * Новые изменения схемы — только новым элементом массива, старые не редактируются.
 */
export const migrations: string[] = [
  `
  CREATE TABLE students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    phone       TEXT    NOT NULL,
    group_name  TEXT    NOT NULL CHECK (length(group_name) BETWEEN 1 AND 100),
    monthly_fee INTEGER NOT NULL CHECK (monthly_fee >= 0),           -- копейки
    start_date  TEXT    NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_students_group ON students (group_name);

  CREATE TABLE payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL CHECK (amount > 0),                  -- копейки
    paid_on    TEXT    NOT NULL CHECK (paid_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  -- Покрывает и список оплат ученика, и суммирование оплат за месяц в отчёте о должниках.
  CREATE INDEX idx_payments_student_date ON payments (student_id, paid_on);
  `,
];
