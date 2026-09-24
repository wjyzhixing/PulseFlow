import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

interface BuildAppOptions {
  rateLimit?: {
    max: number;
    timeWindow: number | string;
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  app.register(rateLimit, {
    global: true,
    max: options.rateLimit?.max ?? 100,
    timeWindow: options.rateLimit?.timeWindow ?? '1 minute'
  });
  app.after(() => {
    app.get('/health', async () => ({ ok: true }));
  });
  return app;
}
