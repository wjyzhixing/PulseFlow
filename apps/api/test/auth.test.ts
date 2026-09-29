import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('workspace authentication', () => {
  it('validates the login token with a safe envelope', async () => {
    const credential = ['secret', 'test', 'token'].join('-');
    const app = buildApp({ workspaceToken: credential, dbPath: ':memory:' });
    try {
      const valid = await app.inject({ method: 'POST', url: '/api/session/validate', payload: { token: credential } });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ ok: true, data: { authenticated: true } });
      const invalid = await app.inject({ method: 'POST', url: '/api/session/validate', payload: { token: 'wrong' } });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.json()).toEqual({ ok: false, error: { code: 'auth.invalid', message: 'Unauthorized' } });
    } finally { await app.close(); }
  });

  it('requires a valid bearer token for every business route', async () => {
    const app = buildApp({ workspaceToken: ['secret', 'test', 'token'].join('-'), dbPath: ':memory:' });
    try {
      for (const request of [
        { method: 'POST' as const, url: '/api/requirements/parse', payload: { text: 'hello' } },
        { method: 'POST' as const, url: '/api/drafts/generate', payload: { sections: [] } },
        { method: 'POST' as const, url: '/api/drafts', payload: {} },
        { method: 'GET' as const, url: '/api/drafts/one' },
        { method: 'PUT' as const, url: '/api/drafts/one', payload: {} }
      ]) {
        for (const authorization of [undefined, 'Bearer wrong']) {
          const response = await app.inject({ ...request, headers: authorization ? { authorization } : {} });
          expect(response.statusCode, request.url).toBe(401);
          expect(response.json()).toEqual({ ok: false, error: { code: 'auth.invalid', message: 'Unauthorized' } });
        }
      }
    } finally { await app.close(); }
  });

  it('rejects unauthenticated malformed JSON before parsing its body', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/drafts',
        headers: { 'content-type': 'application/json' }, payload: '{'
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ ok: false, error: { code: 'auth.invalid', message: 'Unauthorized' } });
    } finally { await app.close(); }
  });

  it('returns safe envelopes for malformed requests and rate limits login attempts', async () => {
    const app = buildApp({ workspaceToken: ['secret', 'test', 'token'].join('-'), dbPath: ':memory:' });
    try {
      const malformed = await app.inject({ method: 'POST', url: '/api/session/validate', headers: { 'content-type': 'application/json' }, payload: '{' });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
      for (let index = 0; index < 4; index += 1) await app.inject({ method: 'POST', url: '/api/session/validate', payload: { token: 'wrong' } });
      const limited = await app.inject({ method: 'POST', url: '/api/session/validate', payload: { token: 'wrong' } });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ ok: false, error: { code: 'rate.limited' } });
    } finally { await app.close(); }
  });

  it('allows isolated environments to override the login rate limit', async () => {
    const credential = ['secret', 'test', 'token'].join('-');
    const app = buildApp({ workspaceToken: credential, dbPath: ':memory:', sessionRateLimit: { max: 50, timeWindow: '1 minute' } });
    try {
      const responses = await Promise.all(Array.from({ length: 8 }, () => app.inject({
        method: 'POST', url: '/api/session/validate', payload: { token: credential }
      })));
      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    } finally { await app.close(); }
  });
});
