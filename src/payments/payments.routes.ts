import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponseSchema } from '../http/errors.js';
import { studentIdParamsSchema } from '../students/students.schemas.js';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentIdParamsSchema,
  paymentSchema,
  studentPaymentsQuerySchema,
} from './payments.schemas.js';

export const paymentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { payments } = app.services;
  const tags = ['Оплаты'];

  app.post('/payments', {
    schema: {
      tags,
      summary: 'Добавить оплату',
      body: createPaymentSchema,
      response: { 201: paymentSchema, 400: errorResponseSchema, 404: errorResponseSchema, 422: errorResponseSchema },
    },
    handler: async (req, reply) => reply.code(201).send(payments.add(req.body)),
  });

  app.get('/payments', {
    schema: {
      tags,
      summary: 'Оплаты ученика',
      querystring: listPaymentsQuerySchema,
      response: { 200: z.array(paymentSchema), 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req) => payments.listByStudent(req.query.studentId, req.query.month),
  });

  app.get('/students/:id/payments', {
    schema: {
      tags,
      summary: 'Оплаты ученика (вложенный ресурс)',
      params: studentIdParamsSchema,
      querystring: studentPaymentsQuerySchema,
      response: { 200: z.array(paymentSchema), 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req) => payments.listByStudent(req.params.id, req.query.month),
  });

  app.delete('/payments/:id', {
    schema: {
      tags,
      summary: 'Отменить ошибочную оплату',
      params: paymentIdParamsSchema,
      response: { 200: paymentSchema, 404: errorResponseSchema },
    },
    handler: async (req) => payments.remove(req.params.id),
  });
};
