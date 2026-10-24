import type { DB } from '../db/database.js';
import { kopecksToRubles, rublesToKopecks } from '../lib/money.js';
import type { ListStudentsQuery, Student, UpdateStudentInput } from './students.schemas.js';

interface StudentRow {
  id: number;
  name: string;
  phone: string;
  group_name: string;
  monthly_fee: number;
  start_date: string;
  created_at: string;
  updated_at: string;
}

export interface NewStudent {
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
  startDate: string;
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    group: row.group_name,
    monthlyFee: kopecksToRubles(row.monthly_fee),
    startDate: row.start_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Поле API → колонка таблицы и преобразование значения. */
const updatableColumns = {
  name: { column: 'name', toDb: (v: string) => v },
  phone: { column: 'phone', toDb: (v: string) => v },
  group: { column: 'group_name', toDb: (v: string) => v },
  monthlyFee: { column: 'monthly_fee', toDb: (v: number) => rublesToKopecks(v) },
  startDate: { column: 'start_date', toDb: (v: string) => v },
} as const;

export class StudentsRepository {
  constructor(private readonly db: DB) {}

  list(query: ListStudentsQuery = {}): Student[] {
    const where: string[] = [];
    const params: Record<string, string> = {};
    if (query.group) {
      where.push('group_name = @group');
      params.group = query.group;
    }
    if (query.search) {
      where.push("(ulower(name) LIKE @search ESCAPE '\\' OR phone LIKE @search ESCAPE '\\')");
      params.search = `%${escapeLike(query.search.toLocaleLowerCase('ru-RU'))}%`;
    }
    const sql = `SELECT * FROM students ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY ulower(name), id`;
    return (this.db.prepare(sql).all(params) as StudentRow[]).map(toStudent);
  }

  findById(id: number): Student | undefined {
    const row = this.db.prepare('SELECT * FROM students WHERE id = ?').get(id) as StudentRow | undefined;
    return row && toStudent(row);
  }

  exists(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM students WHERE id = ?').get(id) !== undefined;
  }

  create(input: NewStudent): Student {
    const row = this.db
      .prepare(
        `INSERT INTO students (name, phone, group_name, monthly_fee, start_date)
         VALUES (@name, @phone, @group, @monthlyFee, @startDate)
         RETURNING *`,
      )
      .get({ ...input, monthlyFee: rublesToKopecks(input.monthlyFee) }) as StudentRow;
    return toStudent(row);
  }

  update(id: number, patch: UpdateStudentInput): Student | undefined {
    const sets: string[] = [];
    const params: Record<string, string | number> = { id };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const spec = updatableColumns[key as keyof typeof updatableColumns];
      sets.push(`${spec.column} = @${key}`);
      params[key] = (spec.toDb as (v: unknown) => string | number)(value);
    }
    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    const row = this.db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = @id RETURNING *`).get(params) as
      | StudentRow
      | undefined;
    return row && toStudent(row);
  }

  /** Удаляет ученика вместе с его оплатами (ON DELETE CASCADE). */
  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM students WHERE id = ?').run(id).changes > 0;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
