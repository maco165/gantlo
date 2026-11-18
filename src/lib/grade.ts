import type { Blank, ChoiceQuestion } from '../content/types';

/** 前後の空白を除き、間の空白の並びを 1 つにする。大文字と小文字はそのまま (curl のオプションも JSON のキーも区別する) */
export function normalizeAnswer(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * メディアタイプを比べられる形にする。type/subtype と引数の名前、charset の値は大文字と小文字を区別しない (RFC 9110 8.3.1・8.3.2)。
 * ほかの引数の値 (boundary など) はそのまま残す。`;` の前後の空白は揃える
 */
export function normalizeMediaType(input: string): string {
  const [type, ...params] = normalizeAnswer(input).split(';').map((s) => s.trim());
  const cleaned = params
    .filter((p) => p !== '')
    .map((p) => {
      const eq = p.indexOf('=');
      if (eq < 0) return p.toLowerCase();
      const name = p.slice(0, eq).trim().toLowerCase();
      const value = p.slice(eq + 1).trim();
      return `${name}=${name === 'charset' ? value.toLowerCase() : value}`;
    });
  return [type.toLowerCase(), ...cleaned].join('; ');
}

function normalizeFor(blank: Pick<Blank, 'match'>, input: string): string {
  switch (blank.match) {
    case 'header-name':
      return normalizeAnswer(input).toLowerCase();
    case 'media-type':
      return normalizeMediaType(input);
    default:
      return normalizeAnswer(input);
  }
}

/** 空欄 1 つを採点する。別解の配列のどれかに一致すれば正解。空は不正解 */
export function gradeBlank(blank: Blank, input: string): boolean {
  if (normalizeAnswer(input) === '') return false;
  const value = normalizeFor(blank, input);
  return blank.answers.some((a) => normalizeFor(blank, a) === value);
}

/** 穴埋め (command・http) を採点する。空欄ごとの正誤と、全部合ったかを返す */
export function gradeFill(q: { blanks: readonly Blank[] }, inputs: readonly string[]): { correct: boolean; blanks: boolean[] } {
  const blanks = q.blanks.map((b, i) => gradeBlank(b, inputs[i] ?? ''));
  return { correct: blanks.length > 0 && blanks.every(Boolean), blanks };
}

export function gradeChoice(q: Pick<ChoiceQuestion, 'answer'>, choiceId: string): boolean {
  return q.answer === choiceId;
}

/** 1 問正解ごとの XP と、実習を終えたときの XP */
export const XP_PER_CORRECT = 3;
export const XP_PER_LAB = 10;
