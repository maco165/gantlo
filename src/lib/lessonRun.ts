// レッスンを 1 問ずつ解く流れの計算 (画面から切り離してテストする)。
import type { Question } from '../content/types';
import { XP_PER_CORRECT, XP_PER_LAB } from './grade';
import { completeLesson, type Progress } from './progress';

/**
 * 1 問ぶんの結果。right / wrong は採点した問題、done は実習を終えたもの、
 * skipped はまだ解けない種類 (並べ替え) を飛ばしたもの
 */
export type Outcome = 'right' | 'wrong' | 'done' | 'skipped';

/** 採点する種類か。実習は採点せず、並べ替えはまだ解けない */
export function isGraded(q: Question): boolean {
  return q.kind === 'command' || q.kind === 'http' || q.kind === 'choice';
}

/** 画面で解ける種類か (並べ替えは別の回で作る) */
export function isSupported(q: Question): boolean {
  return q.kind !== 'order';
}

export type LessonScore = { correct: number; total: number; xp: number };

/** 正答数は採点した問題だけで数える。XP は正解 1 問ごとと、終えた実習ごとに足す */
export function lessonScore(questions: readonly Question[], outcomes: readonly (Outcome | undefined)[]): LessonScore {
  let correct = 0;
  let total = 0;
  let labs = 0;
  questions.forEach((q, i) => {
    if (isGraded(q)) {
      total++;
      if (outcomes[i] === 'right') correct++;
    } else if (q.kind === 'lab' && outcomes[i] === 'done') labs++;
  });
  return { correct, total, xp: correct * XP_PER_CORRECT + labs * XP_PER_LAB };
}

/** レッスンを終えた結果を進捗に残す (完了・最高の正答率・XP・連続日数) */
export function finishLesson(p: Progress, lessonId: string, score: LessonScore, now: Date): Progress {
  return completeLesson(p, lessonId, { correct: score.correct, total: score.total }, score.xp, now);
}

/** 完了のレスポンスの本文 (JSON) */
export function resultBody(lessonId: string, score: LessonScore): string {
  return JSON.stringify({ lesson: lessonId, correct: score.correct, total: score.total, xp: score.xp }, null, 2);
}

/** 完了のレスポンスの Location (記録の置き場所に見立てた道。画面の URL ではない) */
export const resultLocation = (lessonId: string) => `/me/lessons/${lessonId}`;
