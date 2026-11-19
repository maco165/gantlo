import { describe, expect, it } from 'vitest';
import {
  ANSWER_OK,
  ANSWER_WRONG,
  ANSWER_WRONG_MEDIA_TYPE,
  LAB_DONE,
  NOT_FOUND,
  NOT_IMPLEMENTED,
  choiceStatus,
  fillStatus,
  lessonCreated,
  orderStatus,
  progressStatus,
} from '../src/lib/status';

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
});

describe('答えのステータス', () => {
  const header = { match: 'header-name' };
  const media = { match: 'media-type' };
  const text = {};

  it('正解は 200 OK', () => {
    expect(fillStatus([text], [true]).code).toBe(200);
    expect(fillStatus([header, media], [true, true]).code).toBe(200);
    expect(choiceStatus(true).code).toBe(200);
  });
  it('不正解は 400 Bad Request', () => {
    expect(fillStatus([text], [false]).code).toBe(400);
    expect(fillStatus([header, media], [false, true]).code).toBe(400);
    expect(choiceStatus(false).code).toBe(400);
  });
  it('メディアタイプの空欄を誤ると 415 Unsupported Media Type (ほかの空欄が合っていても、誤っていても)', () => {
    expect(fillStatus([header, media], [true, false]).code).toBe(415);
    expect(fillStatus([header, media], [false, false]).code).toBe(415);
    expect(fillStatus([media], [false]).code).toBe(415);
  });
  it('答えの数が足りなければ不正解', () => {
    expect(fillStatus([header, media], [true]).code).toBe(415);
    expect(fillStatus([text, text], [true]).code).toBe(400);
    expect(fillStatus([], []).code).toBe(400);
  });
  it('並べ替えは、全部の行が正しい位置なら 200 OK', () => {
    expect(orderStatus(0)).toBe(ANSWER_OK);
    expect(orderStatus(0).reason).toBe('OK');
  });
  it('並べ替えの順が違えば 409 Conflict で、違う位置の行の数を日本語の説明に入れる', () => {
    const s = orderStatus(2);
    expect(s.code).toBe(409);
    expect(s.reason).toBe('Conflict');
    expect(s.ja).toContain('2 行が違う位置です');
    expect(orderStatus(1).ja).toContain('1 行が違う位置です');
  });
  it('レッスンの完了は 201 Created で、正答数を説明に入れる', () => {
    const s = lessonCreated(2, 3);
    expect(s.code).toBe(201);
    expect(s.reason).toBe('Created');
    expect(s.ja).toContain('3 問のうち 2 問');
  });
});

describe('どのステータスにも日本語の説明がある', () => {
  const all = [
    progressStatus(0, 8),
    progressStatus(1, 8),
    progressStatus(8, 8),
    NOT_IMPLEMENTED,
    NOT_FOUND,
    ANSWER_OK,
    ANSWER_WRONG,
    ANSWER_WRONG_MEDIA_TYPE,
    orderStatus(0),
    orderStatus(3),
    LAB_DONE,
    lessonCreated(0, 3),
  ];
  it.each(all.map((s) => [`${s.code} ${s.reason}`, s] as const))('%s', (_, s) => {
    expect(s.reason.length).toBeGreaterThan(0);
    // 説明は日本語 (ひらがな・カタカナ・漢字を含む)
    expect(s.ja).toMatch(/[぀-ヿ一-鿿]/);
  });
  it('404 と 501', () => {
    expect(NOT_FOUND.code).toBe(404);
    expect(NOT_IMPLEMENTED.code).toBe(501);
  });
});
