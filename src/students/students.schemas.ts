import { z } from 'zod';
import { dateSchema } from '../lib/dates.js';
import { monthlyFeeSchema } from '../lib/money.js';
import { phoneSchema } from '../lib/phone.js';

const name = z.string().trim().min(1, 'Укажите имя').max(200).describe('Имя ученика');
const group = z.string().trim().min(1, 'Укажите группу').max(100).describe('Название группы');

export const studentSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    phone: z.string(),
    group: z.string(),
    monthlyFee: z.number().describe('Месячная сумма оплаты в рублях'),
    startDate: z.string().describe('С какой даты ученик занимается; раньше этого месяца долгов нет'),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Student' });

export const createStudentSchema = z.object({
  name,
  phone: phoneSchema,
  group,
  monthlyFee: monthlyFeeSchema,
  startDate: dateSchema.optional().describe('Дата начала занятий, по умолчанию — сегодня'),
});

export const updateStudentSchema = createStudentSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Передайте хотя бы одно поле для изменения');

export const listStudentsQuerySchema = z.object({
  group: z.string().trim().min(1).optional().describe('Точное название группы'),
  search: z.string().trim().min(1).optional().describe('Поиск по части имени или телефона'),
});

export const studentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().describe('ID ученика'),
});

export type Student = z.infer<typeof studentSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
