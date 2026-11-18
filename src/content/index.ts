// 問題データの読み込み。src/content/courses/<course>/*.json を置けば、そのコースに自動でつながる
// (コースや週ごとの PR が同じファイルを触らないため)。中身の検査は scripts/check-content.mjs。
import { COURSES, type CourseId } from '../lib/route';
import type { Lesson, LessonFile, Question } from './types';

const FILES = import.meta.glob<LessonFile>('./courses/*/*.json', { eager: true, import: 'default' });

/** コースの順 (route.ts の COURSES) → ファイル名の順 → ファイルの中の順に並べた、すべてのレッスン */
export const LESSONS: readonly Lesson[] = Object.entries(FILES)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .flatMap(([, file]) => file.lessons)
  .sort((a, b) => courseIndex(a.course) - courseIndex(b.course));

function courseIndex(course: CourseId): number {
  return COURSES.findIndex((c) => c.id === course);
}

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
