// 問題データの読み込み。src/content/courses/<course>/*.json を置けば、そのコースに自動でつながる
// (コースや週ごとの PR が同じファイルを触らないため)。中身の検査は scripts/check-content.mjs。
// 問題の本文まで含む全部のデータなので、ホームから静的に読まない (ホームは目録 content/catalog.ts を使う)。
import { dueReviewIds, type Progress } from '../lib/progress';
import type { CourseId } from '../lib/route';
import { sortLessons } from './catalog';
import type { Lesson, LessonFile, Question } from './types';

const FILES = import.meta.glob<LessonFile>('./courses/*/*.json', { eager: true, import: 'default' });

/** コースの順 (route.ts の COURSES) → ファイル名の順 → ファイルの中の順に並べた、すべてのレッスン */
export const LESSONS: readonly Lesson[] = sortLessons(FILES);

export function lessonsOf(course: CourseId): Lesson[] {
  return LESSONS.filter((l) => l.course === course);
}

export function findLesson(lessonId: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === lessonId);
}

export type QuestionRef = { question: Question; lesson: Lesson };

/** 問題の id から、問題とそのレッスンを引く (復習で使う) */
export function findQuestion(questionId: string): QuestionRef | undefined {
  for (const lesson of LESSONS) {
    const question = lesson.questions.find((q) => q.id === questionId);
    if (question) return { question, lesson };
  }
  return undefined;
}

export { dueReviewCount, isKnownQuestion } from './catalog';

/** 今日の復習の問題 (予定の早い順)。問題データから消えた id は出さない */
export function dueQuestions(p: Progress, now: Date): QuestionRef[] {
  return dueReviewIds(p, now)
    .map((id) => findQuestion(id))
    .filter((r): r is QuestionRef => r !== undefined);
}

