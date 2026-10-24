import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponseSchema } from '../http/errors.js';
import { monthSchema } from '../lib/dates.js';

const debtorSchema = z.object({
  studentId: z.number().int(),
  name: z.string(),
  phone: z.string(),
  group: z.string(),
  monthlyFee: z.number(),
  paid: z.number().describe('Оплачено за месяц, ₽'),
  debt: z.number().describe('Осталось доплатить, ₽'),
});

const debtorsReportSchema = z
  .object({
    month: z.string(),
    totalDebt: z.number().describe('Общий долг за месяц, ₽'),
    count: z.number().int(),
    debtors: z.array(debtorSchema),
    summary: z
      .object({
        studentsCount: z.number().int().describe('Учеников, занимавшихся в этом месяце'),
        expectedTotal: z.number().describe('Сумма месячных сумм этих учеников, ₽'),
        paidTotal: z.number().describe('Фактически оплачено за месяц, включая переплаты, ₽'),
        paidInFullCount: z.number().int().describe('Сколько учеников оплатили месяц полностью'),
      })
      .describe('Сводка месяца для всех учеников, не только должников'),
  })
  .meta({ id: 'DebtorsReport' });

export const debtorsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { debtors, clock } = app.services;

  app.get('/debtors', {
    schema: {
      tags: ['Должники'],
      summary: 'Должники за месяц',
      description:
        'Ученики, которые заплатили за месяц меньше своей месячной суммы. ' +
        'Оплата относится к месяцу по своей дате. Без параметра month — текущий месяц.',
      querystring: z.object({ month: monthSchema.optional() }),
      response: { 200: debtorsReportSchema, 400: errorResponseSchema },
    },
    handler: async (req) => debtors.forMonth(req.query.month ?? clock.currentMonth()),
  });
};
