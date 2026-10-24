import { z } from 'zod';

/** Даты без времени храним как строки YYYY-MM-DD: их удобно сравнивать лексикографически. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (y === 0) return false;
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const dateSchema = z
  .string()
  .refine(isCalendarDate, 'Дата должна быть в формате YYYY-MM-DD и существовать в календаре')
  .describe('Дата в формате YYYY-MM-DD');

export const monthSchema = z
  .string()
  .regex(MONTH_RE, 'Месяц должен быть в формате YYYY-MM')
  .describe('Месяц в формате YYYY-MM');

/** Сегодняшняя дата в указанном часовом поясе. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // Локаль en-CA форматирует дату ровно как YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Полуинтервал дат месяца: [from, to). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    from: `${month}-01`,
    to: nextY === 10000 ? '9999-12-32' : `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}-01`,
  };
}

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/** «2026-10» → «октябрь 2026» */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Источник «сегодня»: в тестах подменяется на фиксированную дату. */
export interface Clock {
  readonly timeZone?: string;
  today(): string;
  currentMonth(): string;
}

export function createClock(timeZone: string): Clock {
  return {
    timeZone,
    today: () => todayIn(timeZone),
    currentMonth: () => todayIn(timeZone).slice(0, 7),
  };
}

export function fixedClock(today: string): Clock {
  return { today: () => today, currentMonth: () => today.slice(0, 7) };
}
