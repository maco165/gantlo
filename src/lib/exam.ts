// 模擬試験 (本編 4 週の総まとめ)。問題を週ごとに同じ数だけ選び、解いている間は正誤を見せず、最後にまとめて採点する。
// 画面 (src/screens/Exam.tsx) から切り離して、選び方・採点・記録をテストする (tests/exam.test.ts)。
import { LESSONS } from '../content/index';
import type { Lesson, Question } from '../content/types';
import { XP_PER_CORRECT } from './grade';
import { shuffleItems } from './order';
import { MAX_EXAM_RECORDS, completeReview, recordAnswer, type ExamRecord, type Progress } from './progress';
import { shuffleChoices, shuffled } from './shuffle';

/** 週ごとに出す数。4 週で 40 問 */
export const EXAM_PER_WEEK = 10;
export const EXAM_MINUTES = 60;
/** 合格の線 (正答率)。75% ちょうどは合格 */
export const PASS_MARK = 0.75;

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

/** 回の記録が合格か (記録した時の合格の線で数える) */
export const isPassed = (r: Pick<ExamRecord, 'correct' | 'total'>) => r.total > 0 && r.correct / r.total >= PASS_MARK;

/** 正しい答えの文 (結果の一覧に出す)。穴埋めは模範解答、4 択は選択肢の文、並べ替えは正しい順 */
export function expectedText(q: Question): string {
  if (q.kind === 'command' || q.kind === 'http') return q.blanks.map((b) => b.answers[0]).join(' / ');
  if (q.kind === 'choice') return q.choices.find((c) => c.id === q.answer)?.text ?? '';
  if (q.kind === 'order') return q.answer.map((id) => q.items.find((it) => it.id === id)?.text ?? id).join(' → ');
  return q.expected;
}
