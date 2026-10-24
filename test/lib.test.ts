import { describe, expect, it } from 'vitest';
import { isCalendarDate, monthRange, todayIn } from '../src/lib/dates.js';
import { parseHumanAmount, rublesToKopecks } from '../src/lib/money.js';
import { normalizePhone } from '../src/lib/phone.js';

describe('money', () => {
  it('переводит рубли в копейки без ошибок float', () => {
    expect(rublesToKopecks(0.1 + 0.2)).toBe(30);
    expect(rublesToKopecks(4500.5)).toBe(450050);
    expect(rublesToKopecks(1.005)).toBe(100); // 1.005 в float — это 1.00499…
  });

  it.each([
    ['4500', 4500],
    ['4500,50', 4500.5],
    ['4 500', 4500],
    ['4500₽', 4500],
    ['0.5', 0.5],
  ])('разбирает сумму «%s»', (input, expected) => {
    expect(parseHumanAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '-100', '1.234', '1e3', '12,5,0'])('отклоняет «%s»', (input) => {
    expect(parseHumanAmount(input)).toBeUndefined();
  });
});

describe('phone', () => {
  it.each([
    ['+7 916 123-45-67', '+79161234567'],
    ['8 (916) 123-45-67', '+79161234567'],
    ['79161234567', '+79161234567'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('нормализует %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['123', 'телефон', '+7 916 abc', '1234567890123456'])('отклоняет %s', (input) => {
    expect(normalizePhone(input)).toBeUndefined();
  });
});

describe('dates', () => {
  it('считает границы месяца, включая декабрь', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(monthRange('0099-12')).toEqual({ from: '0099-12-01', to: '0100-01-01' });
    expect(monthRange('9999-12')).toEqual({ from: '9999-12-01', to: '9999-12-32' });
  });

  it('проверяет существование даты в календаре', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
    expect(isCalendarDate('0001-01-01')).toBe(true);
    expect(isCalendarDate('0096-02-29')).toBe(true);
    expect(isCalendarDate('0000-01-01')).toBe(false);
  });

  it('учитывает часовой пояс при определении «сегодня»', () => {
    const lateEvening = new Date('2026-10-31T22:30:00Z'); // в Москве уже 1 ноября
    expect(todayIn('UTC', lateEvening)).toBe('2026-10-31');
    expect(todayIn('Europe/Moscow', lateEvening)).toBe('2026-11-01');
  });
});
