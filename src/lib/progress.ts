// 進捗はブラウザの localStorage の 1 つのキーに JSON で置く。サーバーには送らない。
// 関数は保存先と今の時刻を引数で受け取り、テストで差し替えられるようにする。
import { COURSES, type CourseId } from './route';

export const STORAGE_KEY = 'gantlo.v1';

export type LessonRecord = { done: boolean; best: number; at: string };
/**
 * 問題ごとの記録。復習の予定 (nextReview、手元の日付) があるものが復習の対象。
 * stage は復習で続けて正解した回数 (0〜2)。予定の計算は recordAnswer
 */
export type AnswerRecord = { right: number; wrong: number; last: string; stage?: number; nextReview?: string };

/** 復習の間隔 (日)。間違えたら翌日、復習で続けて正解するたびに 3 日後・7 日後 */
export const REVIEW_INTERVALS = [1, 3, 7] as const;

/** 計画: 学ぶコースを、学ぶ順に並べたもの。期間と期限は持たない */
export type Plan = { courses: CourseId[] };

/** 設定。無ければ既定の値を使う */
export type Profile = { dailyGoalXp: number };

/** 1 日の目標の XP の既定と選べる値 */
export const DEFAULT_GOAL_XP = 30;
export const GOAL_CHOICES = [10, 20, 30, 50] as const;

export type Progress = {
  v: 1;
  profile?: Profile;
  plan?: Plan;
  streak: { count: number; lastDay: string | null };
  xp: { total: number; byDay: Record<string, number> };
  lessons: Record<string, LessonRecord>;
  answers: Record<string, AnswerRecord>;
};

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyProgress(): Progress {
  return { v: 1, streak: { count: 0, lastDay: null }, xp: { total: 0, byDay: {} }, lessons: {}, answers: {} };
}

/** 端末の時刻での日付 (YYYY-MM-DD) */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** 実在する日付 (YYYY-MM-DD) か。2027-02-31 のようなものは偽 */
export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d)) === v;
}

/** 値を 1 つずつ確かめ、形の合うものだけ残す (読み込んだファイルや壊れた localStorage で画面が落ちないように) */
function cleanRecords<T>(raw: unknown, clean: (v: Record<string, unknown>) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    const c = clean(value);
    if (c !== null) out[key] = c;
  }
  return out;
}

const COURSE_IDS: readonly string[] = COURSES.map((c) => c.id);

/** JSON から読んだものを、欠けや形の違いを埋めた進捗にする。v が 1 でなければ null */
export function normalizeProgress(raw: unknown): Progress | null {
  if (!isObject(raw) || raw.v !== 1) return null;
  const streak = isObject(raw.streak) ? raw.streak : {};
  const xp = isObject(raw.xp) ? raw.xp : {};
  const byDay: Record<string, number> = {};
  if (isObject(xp.byDay)) {
    for (const [day, v] of Object.entries(xp.byDay)) if (isValidDay(day) && isCount(v)) byDay[day] = v;
  }
  const out: Progress = {
    v: 1,
    streak: {
      count: isCount(streak.count) ? Math.floor(streak.count) : 0,
      lastDay: isValidDay(streak.lastDay) ? streak.lastDay : null,
    },
    xp: { total: isCount(xp.total) ? xp.total : 0, byDay },
    lessons: cleanRecords(raw.lessons, (v) =>
      v.done === true ? { done: true, best: isCount(v.best) ? Math.min(v.best, 1) : 0, at: typeof v.at === 'string' ? v.at : '' } : null,
    ),
    answers: cleanRecords(raw.answers, (v) => {
      const a: AnswerRecord = {
        right: isCount(v.right) ? Math.floor(v.right) : 0,
        wrong: isCount(v.wrong) ? Math.floor(v.wrong) : 0,
        last: typeof v.last === 'string' ? v.last : '',
      };
      if (isValidDay(v.nextReview)) {
        a.nextReview = v.nextReview;
        a.stage = isCount(v.stage) ? Math.min(Math.floor(v.stage), REVIEW_INTERVALS.length - 1) : 0;
      }
      return a;
    }),
  };
  if (isObject(raw.profile)) {
    const goal = raw.profile.dailyGoalXp as number;
    out.profile = { dailyGoalXp: (GOAL_CHOICES as readonly number[]).includes(goal) ? goal : DEFAULT_GOAL_XP };
  }
  if (isObject(raw.plan) && Array.isArray(raw.plan.courses)) {
    // 知らないコースと重なりを落とし、順は残す
    const courses = [...new Set(raw.plan.courses.filter((c): c is CourseId => typeof c === 'string' && COURSE_IDS.includes(c)))];
    out.plan = { courses };
  }
  return out;
}

/** 書き出したファイルの中身を読む。読めない・形が違うときは null */
export function parseProgressText(text: string): Progress | null {
  try {
    return normalizeProgress(JSON.parse(text));
  } catch {
    return null;
  }
}

/** 読めない・形が違うときは初期値で始める (例外を外に出さない) */
export function loadProgress(storage: KeyValueStorage | undefined = safeLocalStorage()): Progress {
  if (!storage) return emptyProgress();
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyProgress();
  }
  if (!raw) return emptyProgress();
  return parseProgressText(raw) ?? emptyProgress();
}

/** 保存できたら true。保存できない環境 (プライベートモード・容量の上限など) では false で、その場限りの記録になる */
export function saveProgress(p: Progress, storage: KeyValueStorage | undefined = safeLocalStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * 問題ごとに正解と不正解の回数を数え、復習の予定を決める。
 * - 間違えたら (初めてでも、復習の途中でも) 翌日に復習する (段階 0)
 * - 予定の日以降に正解したら、段階を 1 つ進めて 3 日後・7 日後。7 日後の復習も正解したら予定を外す (卒業)
 * - 予定の日より前に正解しても (レッスンのやり直しなど)、予定は動かさない
 * - 復習の対象でない問題を正解しても、予定は付けない
 * 日付は端末の時刻の日付 (dayKey) で数える。時差のある所でも、利用者の手元の「今日」と「明日」になる
 */
export function recordAnswer(p: Progress, questionId: string, correct: boolean, now: Date): Progress {
  const today = dayKey(now);
  const prev = p.answers[questionId] ?? { right: 0, wrong: 0, last: '' };
  const next: AnswerRecord = {
    right: prev.right + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    last: now.toISOString(),
  };
  if (!correct) {
    next.stage = 0;
    next.nextReview = addDays(today, REVIEW_INTERVALS[0]);
  } else if (prev.nextReview !== undefined && prev.nextReview <= today) {
    const stage = (prev.stage ?? 0) + 1;
    if (stage < REVIEW_INTERVALS.length) {
      next.stage = stage;
      next.nextReview = addDays(today, REVIEW_INTERVALS[stage]);
    }
  } else if (prev.nextReview !== undefined) {
    next.stage = prev.stage ?? 0;
    next.nextReview = prev.nextReview;
  }
  return { ...p, answers: { ...p.answers, [questionId]: next } };
}

/** 今日までに予定が来ている復習の問題の id (予定の早い順。同じ日は id の順) */
export function dueReviewIds(p: Progress, now: Date): string[] {
  const today = dayKey(now);
  return Object.entries(p.answers)
    .filter(([, a]) => a.nextReview !== undefined && a.nextReview <= today)
    .sort(([ia, a], [ib, b]) => (a.nextReview! < b.nextReview! ? -1 : a.nextReview! > b.nextReview! ? 1 : ia < ib ? -1 : ia > ib ? 1 : 0))
    .map(([id]) => id);
}

/** まだ来ていない復習のうち、いちばん近い予定の日と件数。isKnown で問題データにある id だけに絞れる */
export function upcomingReview(p: Progress, now: Date, isKnown: (id: string) => boolean = () => true): { day: string; count: number } | null {
  const today = dayKey(now);
  const days = Object.entries(p.answers)
    .filter(([id]) => isKnown(id))
    .map(([, a]) => a.nextReview)
    .filter((d): d is string => d !== undefined && d > today)
    .sort();
  if (days.length === 0) return null;
  return { day: days[0], count: days.filter((d) => d === days[0]).length };
}

/** 学んだ日の XP を足し、連続日数を進める (レッスンと復習で共通) */
function addActivity(p: Progress, xpGained: number, now: Date): Progress {
  const today = dayKey(now);
  let count: number;
  if (p.streak.lastDay === today) count = Math.max(p.streak.count, 1);
  else if (p.streak.lastDay === addDays(today, -1)) count = p.streak.count + 1;
  else count = 1;
  return {
    ...p,
    streak: { count, lastDay: today },
    xp: { total: p.xp.total + xpGained, byDay: { ...p.xp.byDay, [today]: (p.xp.byDay[today] ?? 0) + xpGained } },
  };
}

/** レッスンを終えた: 完了と最高の正答率を残し、XP を足し、連続日数を進める */
export function completeLesson(
  p: Progress,
  lessonId: string,
  score: { correct: number; total: number },
  xpGained: number,
  now: Date,
): Progress {
  const rate = score.total > 0 ? score.correct / score.total : 0;
  const prev = p.lessons[lessonId];
  const lesson: LessonRecord = { done: true, best: Math.max(prev?.best ?? 0, rate), at: now.toISOString() };
  const after = addActivity(p, xpGained, now);
  return { ...after, lessons: { ...after.lessons, [lessonId]: lesson } };
}

/** 今日の復習を終えた: XP を足し、連続日数を進める (レッスンの完了は付けない) */
export function completeReview(p: Progress, xpGained: number, now: Date): Progress {
  return addActivity(p, xpGained, now);
}

export function todayXp(p: Progress, now: Date): number {
  return p.xp.byDay[dayKey(now)] ?? 0;
}

/** 今日か昨日に学んでいれば続いている。2 日以上空いたら 0 */
export function currentStreak(p: Progress, now: Date): number {
  const today = dayKey(now);
  if (p.streak.lastDay === today || p.streak.lastDay === addDays(today, -1)) return p.streak.count;
  return 0;
}

export function goalXp(p: Progress): number {
  return p.profile?.dailyGoalXp ?? DEFAULT_GOAL_XP;
}

export function setProfile(p: Progress, change: Partial<Profile>): Progress {
  return { ...p, profile: { dailyGoalXp: goalXp(p), ...change } };
}

/** 記録を消す。設定と計画は残す */
export function resetProgress(p: Progress): Progress {
  const next = emptyProgress();
  if (p.profile) next.profile = { ...p.profile };
  if (p.plan) next.plan = { courses: [...p.plan.courses] };
  return next;
}

/** 書き出すファイルの名前 (gantlo-progress-YYYY-MM-DD.json) */
export function exportFileName(now: Date): string {
  return `gantlo-progress-${dayKey(now)}.json`;
}

/** 読み込むファイルの大きさの上限 (1 MB)。書き出したファイルはふつう数十 KB */
export const MAX_IMPORT_BYTES = 1024 * 1024;

/** 読み込みの結果。読めないときは、大きすぎる (413) か形が違う (422) かと、利用者に見せる理由を添える */
export type ImportResult = { ok: true; progress: Progress } | { ok: false; code: 413 | 422; reason: string };

/** 書き出したファイルが必ず持つ欄と、その形 (どれも JSON のオブジェクト) */
const IMPORT_FIELDS = ['streak', 'xp', 'lessons', 'answers'] as const;

/**
 * 読み込むファイルの中身を確かめる。localStorage の読み直し (loadProgress) より厳しく、
 * 書き出したファイルの形 (v が 1 で、streak・xp・lessons・answers がオブジェクト) でなければ読まない。
 * 形が合えば、中の値は normalizeProgress で 1 つずつ確かめて残す
 */
export function parseImport(text: string, bytes: number): ImportResult {
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, code: 413, reason: `ファイルが大きすぎます (${formatBytes(bytes)})。読み込めるのは 1 MB までです。` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 422, reason: 'JSON として読めません。ファイルが壊れているか、別の種類のファイルです。' };
  }
  if (!isObject(raw)) return { ok: false, code: 422, reason: 'gantlo の記録の形ではありません (一番外が JSON のオブジェクトでない)。' };
  if (raw.v !== 1) return { ok: false, code: 422, reason: 'gantlo の記録の形ではありません (版 v が 1 でない)。' };
  const missing = IMPORT_FIELDS.filter((f) => !isObject(raw[f]));
  if (missing.length > 0) return { ok: false, code: 422, reason: `gantlo の記録の形ではありません (${missing.join('・')} の欄が無いか、形が違う)。` };
  const progress = normalizeProgress(raw);
  return progress ? { ok: true, progress } : { ok: false, code: 422, reason: 'gantlo の記録の形ではありません。' };
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

/**
 * 読み込んだ記録で今の記録を置き換える。目標や計画を一度も決めていない端末の書き出しなら、
 * 今の端末の目標と計画を引き継ぐ (決めていないものを既定の値で上書きしない)
 */
export function replaceWithImported(current: Progress, loaded: Progress): Progress {
  const next: Progress = { ...loaded };
  const profile = loaded.profile ?? current.profile;
  const plan = loaded.plan ?? current.plan;
  if (profile) next.profile = { ...profile };
  if (plan) next.plan = { courses: [...plan.courses] };
  return next;
}

/** 記録の中身のあらまし (読み込む前の確かめと、設定の画面に出す) */
export function progressSummary(p: Progress): string {
  const lessons = Object.values(p.lessons).filter((l) => l.done).length;
  const answers = Object.keys(p.answers).length;
  const reviews = Object.values(p.answers).filter((a) => a.nextReview !== undefined).length;
  return `完了したレッスン ${lessons} · 答えた問題 ${answers} (復習の予定 ${reviews}) · 合計 ${p.xp.total} XP`;
}
