// 復習と設定の画面のステータス (#22 と並行のため tests/status.test.ts とは分けて置く)
import { describe, expect, it } from 'vitest';
import { IMPORT_DONE, IMPORT_INVALID, IMPORT_TOO_LARGE, RESET_DONE, SAVE_FAILED, goalSaved, reviewDone, reviewListStatus } from '../src/lib/status';

describe('復習のステータス', () => {
  it('今日の復習があれば 200 で数を入れ、無ければ 204 No Content', () => {
    expect(reviewListStatus(2)).toMatchObject({ code: 200 });
    expect(reviewListStatus(2).ja).toContain('2 問');
    expect(reviewListStatus(0)).toMatchObject({ code: 204, reason: 'No Content' });
  });
  it('解き終えたら 200 で正答数を入れる (レッスンの記録は作らないので 201 にしない)', () => {
    expect(reviewDone(1, 2)).toMatchObject({ code: 200 });
    expect(reviewDone(1, 2).ja).toContain('2 問のうち 1 問');
  });
});

describe('設定のステータス', () => {
  it('目標 200・読み込み 200・大きすぎる 413・形が違う 422・保存できない 507・消した 204', () => {
    expect(goalSaved(10)).toMatchObject({ code: 200 });
    expect(goalSaved(10).ja).toContain('10 XP');
    expect(IMPORT_DONE.code).toBe(200);
    expect(IMPORT_TOO_LARGE.code).toBe(413);
    expect(IMPORT_INVALID.code).toBe(422);
    expect(SAVE_FAILED.code).toBe(507);
    expect(RESET_DONE.code).toBe(204);
  });
  it.each([reviewListStatus(1), reviewListStatus(0), reviewDone(0, 1), goalSaved(20), IMPORT_DONE, IMPORT_TOO_LARGE, IMPORT_INVALID, SAVE_FAILED, RESET_DONE].map((s) => [`${s.code} ${s.reason}`, s] as const))(
    '%s に日本語の説明が付く',
    (_, s) => {
      expect(s.reason.length).toBeGreaterThan(0);
      expect(s.ja).toMatch(/[぀-ヿ一-鿿]/);
    },
  );
});
