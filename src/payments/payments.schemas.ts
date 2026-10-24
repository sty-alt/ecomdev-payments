import { z } from 'zod';
import { dateSchema, monthSchema } from '../lib/dates.js';
import { paymentAmountSchema } from '../lib/money.js';

export const paymentSchema = z
  .object({
    id: z.number().int(),
    studentId: z.number().int(),
    amount: z.number().describe('Сумма в рублях'),
    date: z.string().describe('Дата оплаты, YYYY-MM-DD'),
    createdAt: z.string(),
  })
  .meta({ id: 'Payment' });

export const createPaymentSchema = z.object({
  studentId: z.number().int().positive().describe('ID ученика'),
  amount: paymentAmountSchema,
  date: dateSchema.optional().describe('Дата оплаты, по умолчанию — сегодня. Будущие даты запрещены'),
});

export const listPaymentsQuerySchema = z.object({
  studentId: z.coerce.number().int().positive().describe('ID ученика'),
  month: monthSchema.optional().describe('Только оплаты за месяц YYYY-MM'),
});

export const paymentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().describe('ID оплаты'),
});

export const studentPaymentsQuerySchema = listPaymentsQuerySchema.pick({ month: true });

export type Payment = z.infer<typeof paymentSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
