// 模擬試験 (本編 4 週の総まとめ)。問題を週ごとに同じ数だけ選び、解いている間は正誤を見せず、最後にまとめて採点する。
// 画面 (src/screens/Exam.tsx) から切り離して、選び方・採点・記録をテストする (tests/exam.test.ts)。
// 問題データ (content/index.ts) はここでは読まず、呼ぶ側が渡す (模擬試験の画面は、始めるか途中の回を読み直すときにだけ問題データを読む)。
import type { Lesson, Question } from '../content/types';
import { XP_PER_CORRECT } from './grade';
import { shuffleItems } from './order';
import { EXAM_SAVE_KEY, migrateExamSave, type ExamStorage, type SavedExam, type SavedExamItem } from './examSave';
import { MAX_EXAM_RECORDS, completeReview, recordAnswer, safeLocalStorage, type ExamRecord, type Progress } from './progress';
import { shuffleChoices, shuffled } from './shuffle';

/** 週ごとに出す数。4 週で 40 問 */
export const EXAM_PER_WEEK = 10;
export const EXAM_MINUTES = 60;
/**
 * 合格の目安 (正答率)。75% ちょうどは合格。このサイトが決めた目安で、出典となる一次情報 (資格試験などの公式の基準) は無い。
 * 画面と書き出す HTML では「目安」と書き、PASS_MARK_NOTE を添える
 */
export const PASS_MARK = 0.75;
/** 合格の線の断り書き (画面と書き出す HTML で同じ文を使う) */
export const PASS_MARK_NOTE = '合格の線はこのサイトが決めた目安で、資格試験などの公式の基準ではありません。';

/** 本編の週と、その週で学ぶもの (src/lib/courses.ts の本編の説明と同じ分け方) */
export const EXAM_WEEKS = [
  { week: 1, title: 'HTTP・URI・JSON・MIME・UTF-8' },
  { week: 2, title: 'DNS・TCP/IP・TLS' },
  { week: 3, title: 'REST と OpenAPI' },
  { week: 4, title: 'OAuth 2.0 と JWT' },
] as const;
export type ExamWeek = (typeof EXAM_WEEKS)[number]['week'];

export const EXAM_TOTAL = EXAM_WEEKS.length * EXAM_PER_WEEK;

/** 本編のレッスンの id (main-w<週>-l<番号>) から週を読む。本編でなければ null */
export function weekOf(lesson: Pick<Lesson, 'id' | 'course'>): ExamWeek | null {
  if (lesson.course !== 'main') return null;
  const m = /^main-w(\d+)-/.exec(lesson.id);
  const w = m ? Number(m[1]) : NaN;
  return EXAM_WEEKS.some((x) => x.week === w) ? (w as ExamWeek) : null;
}

export type ExamItem = { question: Question; lesson: Lesson; week: ExamWeek };

/** 出題の元: 本編の採点する問題 (実習は採点しないので出さない) */
export function examBank(lessons: readonly Lesson[]): ExamItem[] {
  const out: ExamItem[] = [];
  for (const lesson of lessons) {
    const week = weekOf(lesson);
    if (week === null) continue;
    for (const question of lesson.questions) if (question.kind !== 'lab') out.push({ question, lesson, week });
  }
  return out;
}

/**
 * 週ごとに EXAM_PER_WEEK 問を重ならずに選び、全体の並びと、4 択の選択肢・並べ替えの項目を混ぜる。
 * ある週の問題が足りなければ、その週はあるだけ出す (問題データの検査は tests/exam.test.ts が持つ)
 */
export function pickExam(bank: readonly ExamItem[], random: () => number = Math.random): ExamItem[] {
  const picked = EXAM_WEEKS.flatMap(({ week }) => shuffled(bank.filter((b) => b.week === week), random).slice(0, EXAM_PER_WEEK));
  return shuffled(picked, random).map((b) => ({
    ...b,
    question: b.question.kind === 'order' ? shuffleItems(b.question, random) : shuffleChoices(b.question, random),
  }));
}

/** 1 問の答え。答える前に時間が切れた問題は undefined (不正解として数える) */
export type ExamAnswer = { correct: boolean; code: number };

export type WeekScore = { week: ExamWeek; title: string; correct: number; total: number; rate: number };

export type ExamResult = {
  correct: number;
  total: number;
  rate: number;
  passed: boolean;
  /** 時間が切れて終わったか */
  timeUp: boolean;
  /** 答えずに終わった数 */
  unanswered: number;
  byWeek: WeekScore[];
  /** 正答率がいちばん低い週 (同じなら先の週)。全部の週が満点なら null */
  weakest: WeekScore | null;
};

const rateOf = (correct: number, total: number) => (total > 0 ? correct / total : 0);

/** まとめて採点する。答えていない問題は不正解 */
export function gradeExam(items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], timeUp: boolean): ExamResult {
  const correct = items.filter((_, i) => answers[i]?.correct === true).length;
  const total = items.length;
  const unanswered = items.filter((_, i) => answers[i] === undefined).length;
  const byWeek = EXAM_WEEKS.map(({ week, title }) => {
    const idx = items.map((it, i) => (it.week === week ? i : -1)).filter((i) => i >= 0);
    const c = idx.filter((i) => answers[i]?.correct === true).length;
    return { week, title, correct: c, total: idx.length, rate: rateOf(c, idx.length) };
  }).filter((w) => w.total > 0);
  const weakest = byWeek.reduce<WeekScore | null>((low, w) => (w.rate < 1 && (low === null || w.rate < low.rate) ? w : low), null);
  const rate = rateOf(correct, total);
  return { correct, total, rate, passed: total > 0 && rate >= PASS_MARK, timeUp, unanswered, byWeek, weakest };
}

/** 読み直すレッスン: いちばん低い週で、間違えた (答えなかった) 問題のあるレッスン (問題データの順) */
export function lessonsToReread(items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], week: ExamWeek, lessons: readonly Lesson[]): Lesson[] {
  const ids = new Set(items.filter((it, i) => it.week === week && answers[i]?.correct !== true).map((it) => it.lesson.id));
  return lessons.filter((l) => ids.has(l.id));
}

/** その回 (runId) をもう記録したか */
export const isRecordedRun = (p: Progress, runId: string | undefined): boolean => runId !== undefined && (p.exams ?? []).some((e) => e.runId === runId);

/**
 * 結果を記録に残す。問題ごとの答えは復習の予定に入れ (間違えた・答えなかった問題は翌日)、正解 1 問ごとに XP を足して連続日数を進め、
 * 回の記録を新しい順の先頭に足す (MAX_EXAM_RECORDS 回まで)。runId を渡すと記録に残し、同じ回をもう記録していれば何もしない
 * (2 つのタブや effect の 2 回の呼び出しで、同じ回を 2 回記録しない)
 */
export function recordExam(p: Progress, items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], result: ExamResult, now: Date, runId?: string): Progress {
  if (isRecordedRun(p, runId)) return p;
  let next = p;
  items.forEach((it, i) => {
    // 答えずに終わった問題は不正解として復習に入れるが、その日に答えた数 (カレンダー) には数えない
    next = recordAnswer(next, it.question.id, answers[i]?.correct === true, now, { answered: answers[i] !== undefined });
  });
  next = completeReview(next, result.correct * XP_PER_CORRECT, now);
  const rec: ExamRecord = { at: now.toISOString(), correct: result.correct, total: result.total, timeUp: result.timeUp, ...(runId !== undefined ? { runId } : {}) };
  return { ...next, exams: [rec, ...(p.exams ?? [])].slice(0, MAX_EXAM_RECORDS) };
}

/** 答えた問題の数 (位置ごとの答えのうち、答えのある数) */
export const answeredCount = (answers: readonly (ExamAnswer | undefined)[]): number => answers.filter((a) => a !== undefined).length;

/** 問題番号の一覧の 1 つの状態 (未回答・回答済み) と、見直しの印 */
export type ExamSlot = { index: number; answered: boolean; marked: boolean };
export function examSlots(total: number, answers: readonly (ExamAnswer | undefined)[], marks: readonly number[]): ExamSlot[] {
  return Array.from({ length: total }, (_, i) => ({ index: i, answered: answers[i] !== undefined, marked: marks.includes(i) }));
}

/** 印を付け外しする (付いていれば外し、無ければ付ける) */
export const toggleMark = (marks: readonly number[], i: number): number[] => (marks.includes(i) ? marks.filter((m) => m !== i) : [...marks, i].sort((a, b) => a - b));

/** 答えたあとに出す問題: 次の位置。最後の問題のあとは null (採点の前の確かめへ) */
export const nextIndex = (index: number, total: number): number | null => (index + 1 < total ? index + 1 : null);

/** 残りの時間 (ミリ秒) を「mm:ss」にする。0 より小さければ 00:00 */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 回の記録が合格か (今の合格の線 PASS_MARK で数える。記録は合否を持たない) */
export const isPassed = (r: Pick<ExamRecord, 'correct' | 'total'>) => r.total > 0 && r.correct / r.total >= PASS_MARK;

/** 正しい答えの文 (結果の一覧に出す)。穴埋めは模範解答、4 択は選択肢の文、並べ替えは正しい順 */
export function expectedText(q: Question): string {
  if (q.kind === 'command' || q.kind === 'http') return q.blanks.map((b) => b.answers[0]).join(' / ');
  if (q.kind === 'choice') return q.choices.find((c) => c.id === q.answer)?.text ?? '';
  if (q.kind === 'order') return q.answer.map((id) => q.items.find((it) => it.id === id)?.text ?? id).join(' → ');
  return q.expected;
}

/** 種から決まる乱数 (mulberry32)。同じ種なら同じ並びを返す */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 模擬試験の出題に使う乱数。URL に ?seed=<整数> があればその種で決まる乱数 (検査で出題を固定するため)、無ければ Math.random。
 * 本番の画面からは種を付けるリンクを出さない
 */
export function examRandom(search: string): () => number {
  const raw = new URLSearchParams(search).get('seed');
  return raw !== null && /^\d{1,10}$/.test(raw) ? seededRandom(Number(raw)) : Math.random;
}

/**
 * 途中の回 (出題・答え・期限・今の位置・見直しの印) を残す形にする。答えは問題の位置ごとに並べ、答えていない位置は null。
 * 最後の答えより後ろの null は残さない
 */
export function toSavedExam(
  items: readonly ExamItem[],
  answers: readonly (ExamAnswer | undefined)[],
  deadline: number,
  runId: string,
  { index, marks = [] }: { index?: number; marks?: readonly number[] } = {},
): SavedExam {
  let last = -1;
  for (let i = 0; i < Math.min(answers.length, items.length); i++) if (answers[i] !== undefined) last = i;
  const out: SavedExam = {
    v: 2,
    runId,
    items: items.map(({ question: q }) => (q.kind === 'choice' ? { id: q.id, order: q.choices.map((c) => c.id) } : q.kind === 'order' ? { id: q.id, order: q.items.map((it) => it.id) } : { id: q.id })),
    answers: Array.from({ length: last + 1 }, (_, i) => {
      const a = answers[i];
      return a ? { correct: a.correct, code: a.code } : null;
    }),
    deadline,
    marks: [...new Set(marks)].filter((m) => Number.isInteger(m) && m >= 0 && m < items.length).sort((a, b) => a - b),
  };
  if (index !== undefined) out.index = index;
  return out;
}

const isPermutation = (ids: unknown, of: readonly string[]) =>
  Array.isArray(ids) && ids.length === of.length && ids.every((id) => typeof id === 'string') && new Set(ids).size === of.length && of.every((id) => ids.includes(id));

/**
 * 残した途中の回を、出題の元 (examBank) と突き合わせて読み直す。形が違う・問題データから消えた問題がある・
 * 同じ問題が 2 回ある・選択肢や項目の並びが今の問題と合わない・答えが問題の数より多い、のどれかなら null (最初から)。
 * answers は位置ごと (答えていない位置は undefined)。index は今の位置 (古い保存は答えた数。最後の問題を超えない)、marks は見直しの印
 */
export type RestoredExam = { runId: string; items: ExamItem[]; answers: (ExamAnswer | undefined)[]; deadline: number; index: number; marks: number[] };

export function fromSavedExam(raw: unknown, bank: readonly ExamItem[]): RestoredExam | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof SavedExam, unknown>>;
  // v は 1 (前の版の形。鍵 gantlo.exam.v1 から移したもの) か 2
  if ((r.v !== 1 && r.v !== 2) || typeof r.runId !== 'string' || r.runId === '' || r.runId.length > 64 || !Array.isArray(r.items) || !Array.isArray(r.answers) || typeof r.deadline !== 'number' || !Number.isFinite(r.deadline)) return null;
  // 答えは問題の数まで (全部に答えて採点の前の確かめにいる回もある)
  if (r.items.length === 0 || r.items.length > EXAM_TOTAL || r.answers.length > r.items.length) return null;
  const byId = new Map(bank.map((b) => [b.question.id, b]));
  const items: ExamItem[] = [];
  const seen = new Set<string>();
  for (const it of r.items as unknown[]) {
    const id = (it as SavedExamItem | null)?.id;
    if (typeof id !== 'string' || seen.has(id)) return null;
    seen.add(id);
    const b = byId.get(id);
    if (!b) return null;
    const q = b.question;
    const order = (it as SavedExamItem).order;
    if (q.kind === 'choice') {
      if (!isPermutation(order, q.choices.map((c) => c.id))) return null;
      items.push({ ...b, question: { ...q, choices: order!.map((cid) => q.choices.find((c) => c.id === cid)!) } });
    } else if (q.kind === 'order') {
      if (!isPermutation(order, q.items.map((x) => x.id))) return null;
      items.push({ ...b, question: { ...q, items: order!.map((oid) => q.items.find((x) => x.id === oid)!) } });
    } else items.push(b);
  }
  const answers: (ExamAnswer | undefined)[] = [];
  for (const a of r.answers as unknown[]) {
    if (a === null) {
      answers.push(undefined);
      continue;
    }
    const x = a as Partial<ExamAnswer> | null;
    if (typeof x?.correct !== 'boolean' || typeof x.code !== 'number' || !Number.isInteger(x.code)) return null;
    answers.push({ correct: x.correct, code: x.code });
  }
  const n = items.length;
  const index = Number.isInteger(r.index) && (r.index as number) >= 0 && (r.index as number) < n ? (r.index as number) : Math.min(answers.length, n - 1);
  const marks = Array.isArray(r.marks) ? [...new Set(r.marks.filter((m): m is number => Number.isInteger(m) && m >= 0 && m < n))].sort((a, b) => a - b) : [];
  return { runId: r.runId, items, answers, deadline: r.deadline, index, marks };
}

/**
 * 途中の回を読む。無い・読めない・形が違うときは null (壊れた中身は消して、次から最初の画面にする)。
 * progress を渡すと、もう記録した回 (別のタブで採点した回など) の保存も捨てる
 */
export function loadExamRun(bank: readonly ExamItem[], storage: ExamStorage | undefined = safeLocalStorage(), progress?: Progress): RestoredExam | null {
  if (!storage) return null;
  try {
    migrateExamSave(storage);
    const text = storage.getItem(EXAM_SAVE_KEY);
    if (!text) return null;
    const run = fromSavedExam(JSON.parse(text), bank);
    if (!run || (progress && isRecordedRun(progress, run.runId))) {
      storage.removeItem(EXAM_SAVE_KEY);
      return null;
    }
    return run;
  } catch {
    // JSON として読めない中身も消す
    try {
      storage.removeItem(EXAM_SAVE_KEY);
    } catch {
      // 消せない環境では次も読めずに最初の画面になる
    }
    return null;
  }
}

/**
 * 期限を過ぎた途中の回を、時間切れとして採点して記録する。同じ回をもう記録していれば記録は変えない (何回呼んでも 1 件)。
 * 画面 (Exam.tsx) は開いたとき・続きの案内の間に期限が来たとき・案内から新しく始めるときに呼ぶ
 */
export function recordExpiredRun(p: Progress, run: RestoredExam, now: Date): { progress: Progress; result: ExamResult } {
  const result = gradeExam(run.items, run.answers, true);
  return { progress: recordExam(p, run.items, run.answers, result, now, run.runId), result };
}
