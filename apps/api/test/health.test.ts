import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns the health envelope', async () => {
    const app = buildApp({ dbPath: ':memory:' });
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('rate limits requests after the configured maximum', async () => {
    const app = buildApp({ dbPath: ':memory:', rateLimit: { max: 1, timeWindow: '1 minute' } });
    try {
      const first = await app.inject({ method: 'GET', url: '/health' });
      const second = await app.inject({ method: 'GET', url: '/health' });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});
