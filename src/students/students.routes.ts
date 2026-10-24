import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponseSchema } from '../http/errors.js';
import { studentNotFound } from '../lib/errors.js';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  studentIdParamsSchema,
  studentSchema,
  updateStudentSchema,
} from './students.schemas.js';

export const studentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { students, clock } = app.services;
  const tags = ['Ученики'];

  app.get('/students', {
    schema: {
      tags,
      summary: 'Список учеников',
      querystring: listStudentsQuerySchema,
      response: { 200: z.array(studentSchema) },
    },
    handler: async (req) => students.list(req.query),
  });

  app.get('/students/:id', {
    schema: {
      tags,
      summary: 'Ученик по ID',
      params: studentIdParamsSchema,
      response: { 200: studentSchema, 404: errorResponseSchema },
    },
    handler: async (req) => {
      const student = students.findById(req.params.id);
      if (!student) throw studentNotFound(req.params.id);
      return student;
    },
  });

  app.post('/students', {
    schema: {
      tags,
      summary: 'Создать ученика',
      body: createStudentSchema,
      response: { 201: studentSchema, 400: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const student = students.create({ ...req.body, startDate: req.body.startDate ?? clock.today() });
      return reply.code(201).send(student);
    },
  });

  app.patch('/students/:id', {
    schema: {
      tags,
      summary: 'Изменить ученика (частично)',
      params: studentIdParamsSchema,
      body: updateStudentSchema,
      response: { 200: studentSchema, 400: errorResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req) => {
      const student = students.update(req.params.id, req.body);
      if (!student) throw studentNotFound(req.params.id);
      return student;
    },
  });

  app.delete('/students/:id', {
    schema: {
      tags,
      summary: 'Удалить ученика вместе с его оплатами',
      params: studentIdParamsSchema,
      response: { 204: z.null(), 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      if (!students.delete(req.params.id)) throw studentNotFound(req.params.id);
      return reply.code(204).send(null);
    },
  });
};
