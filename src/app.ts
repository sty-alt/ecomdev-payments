import { fileURLToPath } from 'node:url';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { debtorsRoutes } from './debtors/debtors.routes.js';
import { type BasicAuthCredentials, registerBasicAuth } from './http/auth.js';
import { registerErrorHandling } from './http/errors.js';
import { paymentsRoutes } from './payments/payments.routes.js';
import type { Services } from './services.js';
import { studentsRoutes } from './students/students.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
  }
}

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
// Шрифт раздаём сами, а не с Google Fonts: страница не зависит от внешних CDN и не передаёт им IP посетителей.
const fontsDir = fileURLToPath(new URL('../node_modules/@fontsource-variable/golos-text/files', import.meta.url));

export interface BuildAppOptions extends FastifyServerOptions {
  /** Если задано — API, страница и /docs закрыты Basic Auth. */
  auth?: BasicAuthCredentials;
}

export async function buildApp(services: Services, { auth, ...options }: BuildAppOptions = {}) {
  const app = Fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('services', services);
  registerErrorHandling(app);
  if (auth) registerBasicAuth(app, auth);

  // Заголовки безопасности. CSP разрешает только собственные скрипты, стили, шрифты и запросы.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Учёт оплат учебного центра',
        description: 'Ученики, оплаты и должники за месяц. Суммы — в рублях, даты — YYYY-MM-DD.',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  // staticCSP: Swagger UI подставляет в CSP хэши своих inline-скриптов и стилей.
  await app.register(fastifySwaggerUi, { routePrefix: '/docs', staticCSP: true });

  app.get('/health', {
    schema: { hide: true, response: { 200: z.object({ status: z.literal('ok') }) } },
    handler: async () => ({ status: 'ok' as const }),
  });

  await app.register(studentsRoutes);
  app.get('/calendar', {
    schema: {
      tags: ['Календарь'],
      summary: 'Дата и часовой пояс учебного центра',
      response: { 200: z.object({ today: z.string(), timeZone: z.string() }) },
    },
    handler: async () => ({ today: services.clock.today(), timeZone: services.clock.timeZone ?? 'UTC' }),
  });
  await app.register(paymentsRoutes);
  await app.register(debtorsRoutes);

  // Веб-интерфейс (вариант Б): статическая страница, работающая с этим же API.
  await app.register(fastifyStatic, { root: publicDir, wildcard: false });
  await app.register(fastifyStatic, {
    root: fontsDir,
    prefix: '/fonts/',
    decorateReply: false,
    maxAge: '365d',
    immutable: true,
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
