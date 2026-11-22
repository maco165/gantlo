// 進捗の画面 (screens/ProgressScreen.tsx) の計算。画面はここの結果を描くだけにする。
import { CATALOG, type LessonMeta } from '../content/catalog';
import { isDone } from './plan';
import { dayKey, type Progress } from './progress';
import { COURSES, type CourseId } from './route';

/** 正答率。right は正解の回数、total は答えた回数 (正解 + 不正解)。答えていなければ rate は null */
export type Accuracy = { right: number; total: number; rate: number | null };

/**
 * 問題ごとの記録 (answers) を足した正答率。レッスンでも復習でも、答えるたびに数える。
 * 問題データにある問題だけを数える (消えた問題の記録は数えない)。採点しない実習は記録が無いので入らない
 */
export function accuracy(p: Progress, lessons: readonly LessonMeta[] = CATALOG): Accuracy {
  let right = 0;
  let total = 0;
  for (const l of lessons) {
    for (const q of l.questions) {
      const a = p.answers[q.id];
      if (!a) continue;
      right += a.right;
      total += a.right + a.wrong;
    }
  }
  return { right, total, rate: total > 0 ? right / total : null };
}

/** 正答率の見せ方 (75% のように丸める)。答えていなければ — */
export const formatRate = (a: Accuracy) => (a.rate === null ? '—' : `${Math.round(a.rate * 100)}%`);

/** この 7 日 (今日を含む、端末の時刻の日付) の日ごとの XP。古い順 */
export function weeklyXp(p: Progress, now: Date): { day: string; xp: number }[] {
  const out: { day: string; xp: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    out.push({ day, xp: p.xp.byDay[day] ?? 0 });
  }
  return out;
}

/** コース 1 つの進み具合。done は済んだレッスンの数、total はレッスンの数 (0 ならまだレッスンが無い) */
export type CourseProgress = { course: CourseId; title: string; done: number; total: number; accuracy: Accuracy };

export function courseProgress(p: Progress, lessons: readonly LessonMeta[] = CATALOG): CourseProgress[] {
  return COURSES.map((c) => {
    const ls = lessons.filter((l) => l.course === c.id);
    return { course: c.id, title: c.title, done: ls.filter((l) => isDone(p, l.id)).length, total: ls.length, accuracy: accuracy(p, ls) };
  });
}
