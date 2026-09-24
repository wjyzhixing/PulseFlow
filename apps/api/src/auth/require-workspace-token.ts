import { createHash, timingSafeEqual } from 'node:crypto';

export function tokenEquals(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !provided || !expected) return false;
  const actualDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function hasValidBearerToken(header: unknown, expected: string): boolean {
  if (typeof header !== 'string') return false;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match !== null && tokenEquals(match[1], expected);
}

export const unauthorized = { ok: false, error: { code: 'auth.invalid', message: 'Unauthorized' } } as const;
