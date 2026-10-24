import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
    }),
  })
  .meta({ id: 'Error' });

type ErrorBody = z.infer<typeof errorResponseSchema>;

/** Единый формат ошибок: { error: { code, message, details? } }. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((issue) => {
        const path = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');
        const field = [err.validationContext, path].filter(Boolean).join('.');
        return { field, message: issue.message ?? 'Некорректное значение' };
      });
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Некорректные данные запроса', details },
      } satisfies ErrorBody);
    }

    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } } satisfies ErrorBody);
    }

    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause.issues }, 'Ответ не соответствует схеме');
    } else if (err.statusCode && err.statusCode < 500) {
      // Ошибки уровня Fastify: битый JSON, неверный Content-Type, слишком большое тело и т. п.
      return reply.code(err.statusCode).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
    } else {
      req.log.error({ err }, 'Необработанная ошибка');
    }
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Маршрут ${req.method} ${req.url} не найден` } }),
  );
}
