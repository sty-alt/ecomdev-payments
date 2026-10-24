import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastDayOf, localToday, setCenterTimeZone, shiftMonth } from '../public/js/format.js';

afterEach(() => {
  vi.useRealTimers();
  setCenterTimeZone('Europe/Moscow');
});

describe('календарь веб-интерфейса', () => {
  it('использует часовой пояс центра на границе месяца', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T22:30:00Z'));
    setCenterTimeZone('Europe/Moscow');
    expect(localToday()).toBe('2026-11-01');
    setCenterTimeZone('America/Los_Angeles');
    expect(localToday()).toBe('2026-10-31');
  });

  it('переключает месяцы и учитывает високосные годы', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('0099-12', 1)).toBe('0100-01');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('0096-02')).toBe('0096-02-29');
  });
});
