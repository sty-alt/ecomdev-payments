import { z } from 'zod';

/**
 * Приводит телефон к виду +<цифры>. Российский формат 8XXXXXXXXXX превращается в +7XXXXXXXXXX.
 * Возвращает undefined, если после очистки это не похоже на телефон (10–15 цифр).
 */
export function normalizePhone(input: string): string | undefined {
  const trimmed = input.trim();
  if (!/^\+?[\d\s()\-.]+$/.test(trimmed)) return undefined;
  let digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') && digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) return undefined;
  return `+${digits}`;
}

export const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Телефон должен содержать от 10 до 15 цифр, например +7 999 123-45-67' });
      return z.NEVER;
    }
    return phone;
  })
  .describe('Телефон; сохраняется в виде +79991234567');
