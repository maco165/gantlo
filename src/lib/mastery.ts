// 問題ごとの到達 (まだ解いていない・直近で間違えた・1 回正解・2 回続けて正解) と、コースごとの数。
// 数えるのは採点する問題 (実習は採点しないので入らない) で、問題データにある問題だけ
import type { Lesson } from '../content/types';
import { inRowOf, type AnswerRecord, type Progress } from './progress';
import { COURSES, type CourseId } from './route';

export type Mastery = 'new' | 'wrong' | 'once' | 'twice';
export const MASTERY_ORDER: readonly Mastery[] = ['new', 'wrong', 'once', 'twice'];
export const MASTERY_LABELS: Record<Mastery, string> = {
  new: 'まだ解いていない',
  wrong: '間違えた (直近)',
  once: '1 回正解',
  twice: '2 回続けて正解',
};

/** 表の見出しに使う短い名前 (390 幅の 4 列に収める。意味は表の下の文と MASTERY_LABELS で書く) */
export const MASTERY_SHORT: Record<Mastery, string> = { new: 'まだ', wrong: '間違えた', once: '1 回正解', twice: '2 回続けて' };

/** 1 問の到達。続けて正解した数 (inRow。古い記録は回数と復習の段階から推す。lib/progress.ts の inRowOf) で決める */
export function masteryOf(a: AnswerRecord | undefined): Mastery {
  if (!a || a.right + a.wrong === 0) return 'new';
  const n = inRowOf(a);
  return n <= 0 ? 'wrong' : n === 1 ? 'once' : 'twice';
}

export type MasteryCounts = Record<Mastery, number> & { total: number };

export function countMastery(p: Progress, lessons: readonly Lesson[]): MasteryCounts {
  const out: MasteryCounts = { new: 0, wrong: 0, once: 0, twice: 0, total: 0 };
  for (const l of lessons)
    for (const q of l.questions) {
      if (q.kind === 'lab') continue;
      out[masteryOf(p.answers[q.id])]++;
      out.total++;
    }
  return out;
}

/** コースごとの到達の数 (コースの順。問題の無いコースも 0 で入れる) */
export function courseMastery(p: Progress, lessons: readonly Lesson[]): { course: CourseId; title: string; counts: MasteryCounts }[] {
  return COURSES.map((c) => ({ course: c.id, title: c.title, counts: countMastery(p, lessons.filter((l) => l.course === c.id)) }));
}

/** 割合 (整数の %)。問題が無ければ 0 */
export const share = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);
