// レッスンの目録 (id・題・コース・段・問題の id だけ)。ホーム・メニュー・題・パンくずが使う。
// 問題の本文・答え・解説を含む全部のデータ (content/index.ts) は、レッスンや復習などの画面を開いたときに読む
// (最初の JS を軽くするため)。目録は vite.config.ts の lessonCatalog が同じ JSON から作るので、データと食い違わない。
import type { Progress } from '../lib/progress';
import { dueReviewIds } from '../lib/progress';
import { COURSES, type CourseId } from '../lib/route';
import type { CATALOG_FIELDS } from './catalog-fields';
import type { Lesson } from './types';

/** 目録のレッスン 1 つ。Lesson から問題の中身を除いたもの (Lesson はこの形を満たす) */
export type LessonMeta = Pick<Lesson, (typeof CATALOG_FIELDS)[number]> & { questions: readonly { id: string }[] };

/** コースの順 (route.ts の COURSES) → ファイル名の順 → ファイルの中の順に並べる。目録と全部のデータで同じ順にする */
export function sortLessons<L extends { course: CourseId }>(files: Record<string, { lessons: L[] }>): L[] {
  const courseIndex = (c: CourseId) => COURSES.findIndex((x) => x.id === c);
  return Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([, file]) => file.lessons)
    .sort((a, b) => courseIndex(a.course) - courseIndex(b.course));
}

const FILES = import.meta.glob<{ lessons: LessonMeta[] }>('./courses/*/*.json', { eager: true, import: 'default', query: '?catalog' });

/** レッスンの id → そのレッスンを持つ問題データのファイル (./courses/<course>/<file>.json)。レッスンの画面はそのファイルだけを読む (content/lesson.ts) */
export const LESSON_FILE: ReadonlyMap<string, string> = new Map(Object.entries(FILES).flatMap(([path, f]) => f.lessons.map((l) => [l.id, path] as const)));

/** すべてのレッスンの目録 (全部のデータの LESSONS と同じ順) */
export const CATALOG: readonly LessonMeta[] = sortLessons(FILES);

export function findLessonMeta(lessonId: string): LessonMeta | undefined {
  return CATALOG.find((l) => l.id === lessonId);
}

const QUESTION_IDS = new Set(CATALOG.flatMap((l) => l.questions.map((q) => q.id)));

/** 問題データにある問題の id か (復習の記録に、消えた問題が残っていても数えない) */
export const isKnownQuestion = (questionId: string): boolean => QUESTION_IDS.has(questionId);

/** 今日の復習の数 (ホームの Retry-After と復習の画面で同じ数を出す)。問題データから消えた id は数えない */
export const dueReviewCount = (p: Progress, now: Date): number => dueReviewIds(p, now).filter(isKnownQuestion).length;
