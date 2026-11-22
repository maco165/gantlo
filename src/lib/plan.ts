// 計画と学習管理の計算。画面 (screens/Plan.tsx・Home.tsx) はここの結果を描くだけにする。
// 計画は「学ぶコースを学ぶ順に並べたもの」と、おおよその予定 (開始日・コースごとの目安の日数) で、期限は持たない。
// 予定の帯と巻き・遅れの計算は schedule.ts に置く。
import { CATALOG, type LessonMeta } from '../content/catalog';
import { copyPlan, type Plan, type Progress } from './progress';
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

/**
 * 計画を保存する (PUT /plan)。保存できないときは null。済んだ記録 (lessons・answers・xp) には触れない。
 * 開始日と目安の日数は、渡したものに置き換え、渡さなければ今の計画のものを残す
 */
export function savePlan(p: Progress, courses: readonly CourseId[], schedule: Pick<Plan, 'start' | 'days'> = {}): Progress | null {
  if (!canSavePlan(courses)) return null;
  const plan = copyPlan({ ...p.plan, courses: [...new Set(courses)] });
  if (schedule.start !== undefined) plan.start = schedule.start;
  if (schedule.days !== undefined) {
    if (Object.keys(schedule.days).length > 0) plan.days = { ...schedule.days };
    else delete plan.days;
  }
  return { ...p, plan };
}

/** 計画の順に並べたレッスン (1 本のガントチャートの行の順) */
export function planLessons<L extends LessonMeta = LessonMeta>(courses: readonly CourseId[], lessons: readonly L[] = CATALOG as readonly L[]): L[] {
  return courses.flatMap((c) => lessons.filter((l) => l.course === c));
}

export const isDone = (p: Progress, lessonId: string) => p.lessons[lessonId]?.done === true;

/** 今ここ: 計画の順で最初の未完了のレッスン。index は計画の中の何番目か (0 始まり)、left はその位置 (%)。全部済めば null */
export type Here<L extends LessonMeta = LessonMeta> = { lesson: L; index: number; total: number; left: number };

export function currentLesson<L extends LessonMeta = LessonMeta>(courses: readonly CourseId[], p: Progress, lessons: readonly L[] = CATALOG as readonly L[]): Here<L> | null {
  const ordered = planLessons(courses, lessons);
  const index = ordered.findIndex((l) => !isDone(p, l.id));
  if (index < 0) return null;
  return { lesson: ordered[index], index, total: ordered.length, left: (index / ordered.length) * 100 };
}
