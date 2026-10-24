import { z } from 'zod';

/**
 * Деньги храним в копейках (целые числа), чтобы не ловить ошибки округления float.
 * В API и интерфейсе суммы — рубли с точностью до копейки (например, 4500 или 4500.5).
 */
export const MAX_AMOUNT_RUB = 10_000_000;

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

export function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

function hasAtMostTwoDecimals(value: number): boolean {
  return (value === 0 || Math.abs(value) >= 0.01) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

const rubles = z
  .number({ error: 'Сумма должна быть числом' })
  .max(MAX_AMOUNT_RUB, `Сумма не может превышать ${MAX_AMOUNT_RUB} ₽`)
  .refine(hasAtMostTwoDecimals, 'Сумма может содержать не больше двух знаков после запятой');

/** Сумма оплаты: строго больше нуля. */
export const paymentAmountSchema = rubles
  .refine((value) => value > 0, 'Сумма оплаты должна быть больше нуля')
  .describe('Сумма в рублях, до двух знаков после запятой');

/** Месячная сумма ученика: ноль допустим (например, бесплатное обучение). */
export const monthlyFeeSchema = rubles
  .refine((value) => value >= 0, 'Месячная сумма не может быть отрицательной')
  .describe('Месячная сумма оплаты в рублях');

/**
 * Разбор суммы, введённой человеком: «4500», «4500,50», «4 500».
 * Возвращает undefined, если строка не похожа на сумму.
 */
export function parseHumanAmount(input: string): number | undefined {
  const normalized = input.replace(/[\s ₽]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatRubles(rubles: number): string {
  return rubFormatter.format(rubles);
}
