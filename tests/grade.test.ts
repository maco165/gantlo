import { describe, expect, it } from 'vitest';
import { gradeBlank, gradeChoice, gradeFill, normalizeAnswer, normalizeMediaType } from '../src/lib/grade';

describe('gradeBlank (text)', () => {
  const b = { answers: ['-I'] };

  it('前後の空白は無視する', () => {
    expect(gradeBlank(b, '  -I ')).toBe(true);
  });

  it('大文字と小文字は区別する', () => {
    expect(gradeBlank(b, '-i')).toBe(false);
    expect(gradeBlank({ answers: ['GET'] }, 'get')).toBe(false);
  });

  it('別解の配列のどれでも正解', () => {
    const multi = { answers: ['-I', '--head'] };
    expect(gradeBlank(multi, '-I')).toBe(true);
    expect(gradeBlank(multi, '--head')).toBe(true);
    expect(gradeBlank(multi, '-v')).toBe(false);
  });

  it('空は不正解', () => {
    expect(gradeBlank(b, '   ')).toBe(false);
  });

  it('間の空白の並びは 1 つとして比べる', () => {
    expect(normalizeAnswer(' -X   POST ')).toBe('-X POST');
    expect(gradeBlank({ answers: ['-X POST'] }, '-X  POST')).toBe(true);
  });
});

describe('gradeBlank (header-name と media-type)', () => {
  it('HTTP のヘッダー名は大文字と小文字を区別しない', () => {
    const b = { answers: ['Content-Type'], match: 'header-name' as const };
    expect(gradeBlank(b, 'content-type')).toBe(true);
    expect(gradeBlank(b, 'CONTENT-TYPE ')).toBe(true);
    expect(gradeBlank(b, 'Content-Length')).toBe(false);
  });

  it('メディアタイプは大文字と小文字を区別しない', () => {
    const b = { answers: ['application/json'], match: 'media-type' as const };
    expect(gradeBlank(b, 'Application/JSON')).toBe(true);
    expect(gradeBlank(b, 'text/json')).toBe(false);
  });

  it('メディアタイプの引数は名前と charset の値だけ大文字と小文字を区別しない', () => {
    const b = { answers: ['text/html; charset=utf-8'], match: 'media-type' as const };
    expect(gradeBlank(b, 'text/html;charset=UTF-8')).toBe(true);
    expect(gradeBlank(b, 'TEXT/HTML; Charset=utf-8')).toBe(true);
    expect(normalizeMediaType('multipart/form-data; Boundary=AbC')).toBe('multipart/form-data; boundary=AbC');
  });

  it('RFC 9110 8.3.1 が同じとする 4 つの形は、どれを模範にしても互いに正解', () => {
    const forms = ['text/html;charset=utf-8', 'Text/HTML;Charset="utf-8"', 'text/html; charset="utf-8"', 'text/html;charset=UTF-8'];
    for (const model of forms) {
      for (const input of forms) expect(gradeBlank({ answers: [model], match: 'media-type' }, input), `${model} / ${input}`).toBe(true);
    }
  });

  it('引用符付きの値は引用符を外し、\\ の escape を解いて比べる。引用符の中の ; では区切らない', () => {
    expect(normalizeMediaType('multipart/form-data; boundary="a\\"b"')).toBe('multipart/form-data; boundary=a"b');
    expect(normalizeMediaType('text/plain; x="a;b"; charset=UTF-8')).toBe('text/plain; x=a;b; charset=utf-8');
    // 引用符を外しても、boundary の大文字と小文字は区別する
    expect(gradeBlank({ answers: ['multipart/form-data; boundary=AbC'], match: 'media-type' }, 'multipart/form-data; boundary="abc"')).toBe(false);
  });

  it('match の無い空欄では、ヘッダー名でも区別する', () => {
    expect(gradeBlank({ answers: ['Content-Type'] }, 'content-type')).toBe(false);
  });
});

describe('gradeFill', () => {
  const q = { blanks: [{ answers: ['Content-Type'], match: 'header-name' as const }, { answers: ['application/json'], match: 'media-type' as const }] };

  it('空欄が全部合えば正解で、空欄ごとの正誤も返す', () => {
    expect(gradeFill(q, ['content-type', 'application/json'])).toEqual({ correct: true, blanks: [true, true] });
    expect(gradeFill(q, ['content-type', 'text/plain'])).toEqual({ correct: false, blanks: [true, false] });
  });

  it('答えが足りなければ、その空欄は不正解', () => {
    expect(gradeFill(q, ['Content-Type'])).toEqual({ correct: false, blanks: [true, false] });
  });
});

describe('gradeChoice', () => {
  it('正解の id だけを正解にする', () => {
    expect(gradeChoice({ answer: 'b' }, 'b')).toBe(true);
    expect(gradeChoice({ answer: 'b' }, 'a')).toBe(false);
  });
});
