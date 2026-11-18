// 計画と学習管理の計算。画面 (screens/Plan.tsx・Home.tsx) はここの結果を描くだけにする。
// 計画は「学ぶコースを学ぶ順に並べたもの」で、期限・期間・日付を持たない。横の軸はレッスンの数。
import { LESSONS } from '../content/index';
import type { Lesson } from '../content/types';
import type { Progress } from './progress';
import { COURSES, type CourseId } from './route';

/** 計画が無いときの順: 本編 → 追加のコース (route.ts の COURSES の順) */
export const DEFAULT_ORDER: readonly CourseId[] = COURSES.map((c) => c.id);

/** 今の学ぶ順。保存した計画があればそれ、無ければ既定の順 */
export function planOrder(p: Progress): CourseId[] {
  return p.plan && p.plan.courses.length > 0 ? [...p.plan.courses] : [...DEFAULT_ORDER];
}

/** 選ぶ・外す。選んだコースは最後に足し、外したコースは順から抜く */
export function toggleCourse(courses: readonly CourseId[], id: CourseId): CourseId[] {
  return courses.includes(id) ? courses.filter((c) => c !== id) : [...courses, id];
}

/** 1 つ上 (-1) か下 (+1) に動かす。端では動かさない */
export function moveCourse(courses: readonly CourseId[], id: CourseId, delta: -1 | 1): CourseId[] {
  const i = courses.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= courses.length) return [...courses];
  const next = [...courses];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** コースを 1 つも選ばない計画は保存できない */
export function canSavePlan(courses: readonly CourseId[]): boolean {
  return courses.length > 0;
}

/** 計画を保存する (PUT /plan)。保存できないときは null。済んだ記録 (lessons・answers・xp) には触れない */
export function savePlan(p: Progress, courses: readonly CourseId[]): Progress | null {
  if (!canSavePlan(courses)) return null;
  return { ...p, plan: { courses: [...new Set(courses)] } };
}

/** 計画の順に並べたレッスン (1 本のガントチャートの行の順) */
export function planLessons(courses: readonly CourseId[], lessons: readonly Lesson[] = LESSONS): Lesson[] {
  return courses.flatMap((c) => lessons.filter((l) => l.course === c));
}

export const isDone = (p: Progress, lessonId: string) => p.lessons[lessonId]?.done === true;

/** 計画の帯 1 本ぶん。start と count はレッスンの数、left・width・doneWidth は全体に対する % */
export type PlanBar = {
  course: CourseId;
  title: string;
  start: number;
  count: number;
  done: number;
  left: number;
  width: number;
  doneWidth: number;
};

/** 選んだコースを並べた順に、レッスンの数に比例した帯にする。前の帯が終わった所から次の帯が始まる */
export function planBars(courses: readonly CourseId[], p: Progress, lessons: readonly Lesson[] = LESSONS): PlanBar[] {
  const counts = courses.map((c) => lessons.filter((l) => l.course === c));
  const total = counts.reduce((s, ls) => s + ls.length, 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  let start = 0;
  return courses.map((course, i) => {
    const ls = counts[i];
    const done = ls.filter((l) => isDone(p, l.id)).length;
    const bar: PlanBar = {
      course,
      title: COURSES.find((c) => c.id === course)?.title ?? course,
      start,
      count: ls.length,
      done,
      left: pct(start),
      width: pct(ls.length),
      doneWidth: pct(done),
    };
    start += ls.length;
    return bar;
  });
}

/** 今ここ: 計画の順で最初の未完了のレッスン。index は計画の中の何番目か (0 始まり)、left はその位置 (%)。全部済めば null */
export type Here = { lesson: Lesson; index: number; total: number; left: number };

export function currentLesson(courses: readonly CourseId[], p: Progress, lessons: readonly Lesson[] = LESSONS): Here | null {
  const ordered = planLessons(courses, lessons);
  const index = ordered.findIndex((l) => !isDone(p, l.id));
  if (index < 0) return null;
  return { lesson: ordered[index], index, total: ordered.length, left: (index / ordered.length) * 100 };
}
