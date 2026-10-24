import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export interface BasicAuthCredentials {
  user: string;
  password: string;
}

// Сравниваем хэши одинаковой длины, чтобы время сравнения не выдавало длину или префикс пароля.
const digest = (value: string) => createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * HTTP Basic Auth на все маршруты, кроме /health (его дёргает healthcheck контейнера).
 * Браузер сам показывает окно входа и дальше прикладывает заголовок к fetch-запросам страницы.
 */
export function registerBasicAuth(app: FastifyInstance, credentials: BasicAuthCredentials): void {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;

    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep !== -1) {
        // Оба сравнения выполняются всегда — без короткого замыкания по логину.
        const userOk = safeEqual(decoded.slice(0, sep), credentials.user);
        const passwordOk = safeEqual(decoded.slice(sep + 1), credentials.password);
        if (userOk && passwordOk) return;
      }
    }

    return reply
      .code(401)
      .header('www-authenticate', 'Basic realm="payments", charset="UTF-8"')
      .send({ error: { code: 'UNAUTHORIZED', message: 'Нужен логин и пароль администратора' } });
  });
}
