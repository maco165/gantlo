import { describe, expect, it } from 'vitest';
import { NOT_IMPLEMENTED, progressStatus } from '../src/lib/status';

describe('進み具合のステータス', () => {
  it('何も済んでいなければ 202 Accepted', () => {
    expect(progressStatus(0, 8).code).toBe(202);
  });
  it('途中なら 206 Partial Content で、済んだ数を説明に入れる', () => {
    const s = progressStatus(2, 8);
    expect(s.code).toBe(206);
    expect(s.ja).toContain('8 段のうち 2 段');
  });
  it('全部済めば 200 OK', () => {
    expect(progressStatus(8, 8).code).toBe(200);
  });
  it('どのステータスにも日本語の説明がある', () => {
    for (const s of [progressStatus(0, 8), progressStatus(1, 8), progressStatus(8, 8), NOT_IMPLEMENTED]) {
      expect(s.ja.length).toBeGreaterThan(0);
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });
});
