/**
 * 進み具合を HTTP のステータスで表す。画面を見るたびにステータスコードに触れるため。
 * どのステータスにも日本語の説明を付け、コードの見た目だけで意味を伝えない。
 */
export type Status = { code: number; reason: string; ja: string };

/** 旅の段 (またはレッスン) を何個済ませたか */
export function progressStatus(done: number, total: number): Status {
  if (total <= 0 || done <= 0) return { code: 202, reason: 'Accepted', ja: '受け付けました。まだ始めていません' };
  if (done >= total) return { code: 200, reason: 'OK', ja: '全部済みました' };
  return { code: 206, reason: 'Partial Content', ja: `まだ途中です。${total} 段のうち ${done} 段を学びました` };
}

/** まだ作っていない画面 */
export const NOT_IMPLEMENTED: Status = { code: 501, reason: 'Not Implemented', ja: 'この画面はまだ作っていません' };

/** 知らない道 */
export const NOT_FOUND: Status = { code: 404, reason: 'Not Found', ja: 'この URL のページはありません' };

/** 計画を保存した (PUT /plan) */
export const PLAN_SAVED: Status = { code: 200, reason: 'OK', ja: 'この順で学ぶ計画を保存しました' };

/** 答えが合った */
export const ANSWER_OK: Status = { code: 200, reason: 'OK', ja: '正解です' };

/** 答えが違った */
export const ANSWER_WRONG: Status = { code: 400, reason: 'Bad Request', ja: '不正解です。明日の復習に入ります' };

/** メディアタイプの空欄を誤った (形式の誤り) */
export const ANSWER_WRONG_MEDIA_TYPE: Status = {
  code: 415,
  reason: 'Unsupported Media Type',
  ja: 'メディアタイプが違います。不正解として明日の復習に入ります',
};

/** 並べ替えなど、まだ解けない種類の問題 */
export const KIND_NOT_IMPLEMENTED: Status = { code: 501, reason: 'Not Implemented', ja: 'この種類の問題はまだ解けません。準備中です' };

/** 実習を終えた (採点はしない) */
export const LAB_DONE: Status = { code: 200, reason: 'OK', ja: '実習を終えました' };

/**
 * 穴埋め (command・http) の答えのステータス。全部合えば 200。
 * 誤った空欄にメディアタイプ (match が media-type) があれば 415、ほかの誤りは 400
 */
export function fillStatus(blanks: readonly { match?: string }[], results: readonly boolean[]): Status {
  if (blanks.length > 0 && blanks.every((_, i) => results[i] === true)) return ANSWER_OK;
  if (blanks.some((b, i) => b.match === 'media-type' && results[i] !== true)) return ANSWER_WRONG_MEDIA_TYPE;
  return ANSWER_WRONG;
}

export function choiceStatus(correct: boolean): Status {
  return correct ? ANSWER_OK : ANSWER_WRONG;
}

/** レッスンを終えた。結果を記録として作ったので 201 */
export function lessonCreated(correct: number, total: number): Status {
  return { code: 201, reason: 'Created', ja: `レッスンを終え、記録を作りました。${total} 問のうち ${correct} 問が正解です` };
}

/** 不正解の Retry-After の秒数。間違えた問題は翌日の復習に入る (1 日 = 86400 秒) */
export const RETRY_AFTER_SECONDS = 86400;
