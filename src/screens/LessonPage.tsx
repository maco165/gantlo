import { use } from 'react';
import { loadLesson } from '../content/lesson';
import type { Progress } from '../lib/progress';
import LessonScreen from './LessonScreen';

/**
 * レッスンの道 (/lesson/<id>/) の画面。問題の本文は、そのレッスンを持つファイルだけを開いたときに読む
 * (content/lesson.ts。ホームの最初の JS にも、ほかのコースのデータにも頼らない)。読む間は App の Suspense が待つ。
 * id があるかは App が目録 (content/catalog.ts) で先に見る
 */
export default function LessonPage({ lessonId, nav, progress, updateProgress }: { lessonId: string; nav: number; progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void }) {
  const lesson = use(loadLesson(lessonId));
  if (!lesson) return null;
  // nav を key にして、同じレッスンのリンクを押し直したときも 1 問目から始める
  return <LessonScreen key={`${lesson.id}-${nav}`} lesson={lesson} progress={progress} updateProgress={updateProgress} />;
}
