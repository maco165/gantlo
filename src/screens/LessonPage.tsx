import { findLesson } from '../content/index';
import type { Progress } from '../lib/progress';
import LessonScreen from './LessonScreen';

/**
 * レッスンの道 (/lesson/<id>/) の画面。問題の本文まで含む全部のデータ (content/index.ts) を、この画面と一緒に読む
 * (ホームの最初の JS に入れないため)。id があるかは App が目録 (content/catalog.ts) で先に見る
 */
export default function LessonPage({ lessonId, nav, progress, updateProgress }: { lessonId: string; nav: number; progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void }) {
  const lesson = findLesson(lessonId);
  if (!lesson) return null;
  // nav を key にして、同じレッスンのリンクを押し直したときも 1 問目から始める
  return <LessonScreen key={`${lesson.id}-${nav}`} lesson={lesson} progress={progress} updateProgress={updateProgress} />;
}
