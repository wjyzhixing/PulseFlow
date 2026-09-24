import { describe, expect, it } from 'vitest';
import { parseTextSections } from '../src/parse-text.js';

describe('parseTextSections', () => {
  it('splits Markdown heading sections into stable ids and text', () => {
    expect(parseTextSections('# 订单信息\n字段 A\n## 联系方式\n字段 B')).toEqual([
      { id: 'section-1', heading: '订单信息', text: '字段 A' },
      { id: 'section-2', heading: '联系方式', text: '字段 B' },
    ]);
  });

  it('returns one unheaded section for plain text', () => {
    expect(parseTextSections('业务需求\n需要记录客户名称。')).toEqual([
      { id: 'section-1', heading: null, text: '业务需求\n需要记录客户名称。' },
    ]);
  });

  it('returns no sections for empty text', () => {
    expect(parseTextSections(' \n\t ')).toEqual([]);
  });

  it('rejects text larger than the import byte limit with an actionable error', () => {
    expect(() => parseTextSections('x'.repeat(10 * 1024 * 1024 + 1))).toThrowError(
      expect.objectContaining({ code: 'input.too_large', message: expect.stringContaining('10 MB') }),
    );
  });
});
