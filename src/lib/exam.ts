// 模擬試験 (本編 4 週の総まとめ)。問題を週ごとに同じ数だけ選び、解いている間は正誤を見せず、最後にまとめて採点する。
// 画面 (src/screens/Exam.tsx) から切り離して、選び方・採点・記録をテストする (tests/exam.test.ts)。
import { LESSONS } from '../content/index';
import type { Lesson, Question } from '../content/types';
import { XP_PER_CORRECT } from './grade';
import { shuffleItems } from './order';
import { EXAM_SAVE_KEY, type ExamStorage, type SavedExam, type SavedExamItem } from './examSave';
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
export function examBank(lessons: readonly Lesson[] = LESSONS): ExamItem[] {
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
export function pickExam(bank: readonly ExamItem[] = examBank(), random: () => number = Math.random): ExamItem[] {
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
export function lessonsToReread(items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], week: ExamWeek): Lesson[] {
  const ids = new Set(items.filter((it, i) => it.week === week && answers[i]?.correct !== true).map((it) => it.lesson.id));
  return LESSONS.filter((l) => ids.has(l.id));
}

/**
 * 結果を記録に残す。問題ごとの答えは復習の予定に入れ (間違えた・答えなかった問題は翌日)、正解 1 問ごとに XP を足して連続日数を進め、
 * 回の記録を新しい順の先頭に足す (MAX_EXAM_RECORDS 回まで)
 */
export function recordExam(p: Progress, items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], result: ExamResult, now: Date): Progress {
  let next = p;
  items.forEach((it, i) => {
    next = recordAnswer(next, it.question.id, answers[i]?.correct === true, now);
  });
  next = completeReview(next, result.correct * XP_PER_CORRECT, now);
  const rec: ExamRecord = { at: now.toISOString(), correct: result.correct, total: result.total, timeUp: result.timeUp };
  return { ...next, exams: [rec, ...(p.exams ?? [])].slice(0, MAX_EXAM_RECORDS) };
}

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

/** 途中の回 (出題・答え・期限) を残す形にする。答えは前から順に埋まるので、答えた数が次に出す問題の位置になる */
export function toSavedExam(items: readonly ExamItem[], answers: readonly (ExamAnswer | undefined)[], deadline: number): SavedExam {
  return {
    v: 1,
    items: items.map(({ question: q }) => (q.kind === 'choice' ? { id: q.id, order: q.choices.map((c) => c.id) } : q.kind === 'order' ? { id: q.id, order: q.items.map((it) => it.id) } : { id: q.id })),
    answers: answers.filter((a): a is ExamAnswer => a !== undefined).map((a) => ({ correct: a.correct, code: a.code })),
    deadline,
  };
}

const isPermutation = (ids: unknown, of: readonly string[]) =>
  Array.isArray(ids) && ids.length === of.length && ids.every((id) => typeof id === 'string') && new Set(ids).size === of.length && of.every((id) => ids.includes(id));

/**
 * 残した途中の回を、出題の元 (examBank) と突き合わせて読み直す。形が違う・問題データから消えた問題がある・
 * 同じ問題が 2 回ある・選択肢や項目の並びが今の問題と合わない・答えが問題の数以上、のどれかなら null (最初から)
 */
export function fromSavedExam(raw: unknown, bank: readonly ExamItem[] = examBank()): { items: ExamItem[]; answers: ExamAnswer[]; deadline: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof SavedExam, unknown>>;
  if (r.v !== 1 || !Array.isArray(r.items) || !Array.isArray(r.answers) || typeof r.deadline !== 'number' || !Number.isFinite(r.deadline)) return null;
  if (r.items.length === 0 || r.items.length > EXAM_TOTAL || r.answers.length >= r.items.length) return null;
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
  const answers: ExamAnswer[] = [];
  for (const a of r.answers as unknown[]) {
    const x = a as Partial<ExamAnswer> | null;
    if (typeof x?.correct !== 'boolean' || typeof x.code !== 'number' || !Number.isInteger(x.code)) return null;
    answers.push({ correct: x.correct, code: x.code });
  }
  return { items, answers, deadline: r.deadline };
}

/** 途中の回を読む。無い・読めない・形が違うときは null (壊れた中身は消して、次から最初の画面にする) */
export function loadExamRun(bank?: readonly ExamItem[], storage: ExamStorage | undefined = safeLocalStorage()) {
  if (!storage) return null;
  try {
    const text = storage.getItem(EXAM_SAVE_KEY);
    if (!text) return null;
    const run = fromSavedExam(JSON.parse(text), bank);
    if (!run) storage.removeItem(EXAM_SAVE_KEY);
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
