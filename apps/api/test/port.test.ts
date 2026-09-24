import { describe, expect, it } from 'vitest';
import { parsePort } from '../src/port.js';

describe('parsePort', () => {
  it.each([
    [undefined, 3000],
    ['1', 1],
    ['3000', 3000],
    ['65535', 65535]
  ])('parses %s as %i', (input, expected) => {
    expect(parsePort(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.5', '0', '-1', '65536', ' 1 ', 'Infinity'])(
    'rejects invalid port %s',
    (input) => {
      expect(() => parsePort(input)).toThrow('PORT must be an integer between 1 and 65535');
    }
  );
});
