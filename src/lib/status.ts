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

/**
 * コースの画面 (GET /course/<id>) のステータス。ホームと同じ決まり (まだ 202・途中 206・全部済み 200) で、数えるのはそのコースのレッスン。
 * レッスンがまだ無いコースは、返す本文が無いので 204
 */
export function courseStatus(done: number, total: number): Status {
  if (total <= 0) return { code: 204, reason: 'No Content', ja: 'このコースのレッスンは、これから足します' };
  if (done <= 0) return { code: 202, reason: 'Accepted', ja: `受け付けました。まだ始めていません。${total} レッスンあります` };
  if (done >= total) return { code: 200, reason: 'OK', ja: `${total} レッスンを全部済ませました` };
  return { code: 206, reason: 'Partial Content', ja: `まだ途中です。${total} レッスンのうち ${done} を済ませました` };
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

/**
 * 並べ替えの答えのステータス。全部の行が正しい位置なら 200。
 * 順が違えば 409 Conflict (並べた順が正しい順と食い違う) で、違う位置の行の数を説明に入れる
 */
export function orderStatus(misplaced: number): Status {
  if (misplaced <= 0) return ANSWER_OK;
  return { code: 409, reason: 'Conflict', ja: `${misplaced} 行が違う位置です。不正解として明日の復習に入ります` };
}

/** レッスンを終えた。結果を記録として作ったので 201 */
export function lessonCreated(correct: number, total: number): Status {
  return { code: 201, reason: 'Created', ja: `レッスンを終え、記録を作りました。${total} 問のうち ${correct} 問が正解です` };
}

/** 不正解の Retry-After の秒数。間違えた問題は翌日の復習に入る (1 日 = 86400 秒) */
export const RETRY_AFTER_SECONDS = 86400;

/** 今日の復習の一覧 (GET /me/reviews)。あれば 200、無ければ本文の無い 204 */
export function reviewListStatus(due: number): Status {
  if (due > 0) return { code: 200, reason: 'OK', ja: `今日の復習が ${due} 問あります` };
  return { code: 204, reason: 'No Content', ja: '今日の復習はありません' };
}

/** 今日の復習を解き終えた (POST /me/reviews)。レッスンの記録は作らないので 200 */
export function reviewDone(correct: number, total: number): Status {
  return { code: 200, reason: 'OK', ja: `今日の復習を終えました。${total} 問のうち ${correct} 問が正解です` };
}

/** 1 日の目標を変えた (PATCH /me/profile) */
export function goalSaved(xp: number): Status {
  return { code: 200, reason: 'OK', ja: `1 日の目標を ${xp} XP にしました` };
}

/** 週の目標を変えた (PATCH /me/profile)。null は目標を外した */
export function weeklyGoalSaved(days: number | null): Status {
  return { code: 200, reason: 'OK', ja: days === null ? '週の目標を外しました' : `週の目標を ${days} 日にしました` };
}

/** 学ぶ予定の .ics を作った (GET /me/calendar.ics) */
export const ICS_DONE: Status = { code: 200, reason: 'OK', ja: '学ぶ予定のファイル (.ics) を作りました。カレンダーのアプリで開くと予定に入ります' };

/** .ics の曜日が 1 つも選ばれていない・時刻の形が違う。作らない */
export const ICS_INVALID: Status = { code: 422, reason: 'Unprocessable Content', ja: '曜日を 1 つ以上選び、時刻を入れてください' };

/** 記録を読み込んで置き換えた (PUT /me) */
export const IMPORT_DONE: Status = { code: 200, reason: 'OK', ja: '読み込んだ記録に置き換えました' };

/** 読み込むファイルが 1 MB を超える。読まずに断る */
export const IMPORT_TOO_LARGE: Status = { code: 413, reason: 'Content Too Large', ja: 'ファイルが大きすぎるので読み込みません' };

/** 読み込むファイルが JSON として読めない・gantlo の記録の形でない。読まずに断る */
export const IMPORT_INVALID: Status = { code: 422, reason: 'Unprocessable Content', ja: 'gantlo の記録として読めないので読み込みません' };

/** このブラウザに保存できなかった (容量の上限・プライベートモードなど) */
export const SAVE_FAILED: Status = { code: 507, reason: 'Insufficient Storage', ja: 'このブラウザに保存できませんでした。今の記録はそのままです' };

/** 記録を消した (DELETE /me)。本文は無いので 204 */
export const RESET_DONE: Status = { code: 204, reason: 'No Content', ja: '記録を消しました。目標と計画は残しています' };

/** 用語集を探した (GET /glossary?q=)。当たれば 200 と語の数、1 つも無ければ本文の無い 204 */
export function glossaryStatus(hits: number, query: string): Status {
  if (hits > 0) return { code: 200, reason: 'OK', ja: query.trim() ? `${hits} 語が見つかりました` : `${hits} 語を載せています` };
  return { code: 204, reason: 'No Content', ja: '見つかりませんでした。英語・略語・別の言い方でも探せます' };
}

/** このサイトについて (GET /about) */
export const ABOUT_OK: Status = { code: 200, reason: 'OK', ja: 'このサイトの説明です' };

/** 模擬試験の画面 (GET /exam)。始める前の案内 */
export function examIntroStatus(total: number, minutes: number): Status {
  return { code: 200, reason: 'OK', ja: `本編 4 週から ${total} 問、制限時間は ${minutes} 分です` };
}

/** 途中の回が残っている (GET /me/exams/current)。答えたのは一部なので、ホームの途中と同じ 206 */
export function examResumeStatus(answered: number, total: number): Status {
  return { code: 206, reason: 'Partial Content', ja: `途中の回があります。${total} 問のうち ${answered} 問に答えました` };
}

/**
 * 採点の前の確かめ。本文 (採点の答え) を送る前に確かめる Expect: 100-continue になぞらえて 100 Continue。
 * 未回答と見直しの印の数を説明に入れる
 */
export function examReviewStatus(unanswered: number, marked: number): Status {
  return { code: 100, reason: 'Continue', ja: `採点の前の確かめです。未回答 ${unanswered} 問・見直しの印 ${marked} 問` };
}

/**
 * 模擬試験を終えた (POST /me/exams)。時間内に送れば結果を記録として作ったので 201、
 * 時間が切れたら 408 Request Timeout (答えていない問題は不正解として採点し、記録も残す)。合否は説明に入れる
 */
export function examDone(correct: number, total: number, passed: boolean, timeUp: boolean): Status {
  const verdict = passed ? '合格です' : '不合格です';
  if (timeUp) return { code: 408, reason: 'Request Timeout', ja: `時間が切れました。答えていない問題は不正解です。${total} 問のうち ${correct} 問が正解で、${verdict}` };
  return { code: 201, reason: 'Created', ja: `模擬試験を終え、記録を作りました。${total} 問のうち ${correct} 問が正解で、${verdict}` };
}

/** 試す画面 (GET /try) */
export const TRY_ABOUT: Status = { code: 200, reason: 'OK', ja: '外のサービスに要求を送り、本物の応答を見る画面です。送るのはボタンを押したときだけです' };
