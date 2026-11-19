// リクエストの旅の 8 段の、学んだ具合。ホームのウォーターフォールとステータスに使う。
import { LESSONS } from '../content/index';
import { STAGES, type Stage } from '../content/stages';
import type { Lesson } from '../content/types';
import { isDone } from './plan';
import type { Progress } from './progress';

/**
 * 段 1 つの具合。total はその段に紐づくレッスンの数 (本編と、段を持つ追加のコースのレッスン)、done はそのうち済んだ数。
 * learned (学習済み) は、紐づくレッスンを 1 つでも終えたこと。段の中の残りは帯の塗りの割合 (done / total) で見せる
 */
export type StageState = { id: string; done: number; total: number; learned: boolean };

export function stageStates(p: Progress, lessons: readonly Lesson[] = LESSONS, stages: readonly Stage[] = STAGES): StageState[] {
  return stages.map((s) => {
    const linked = lessons.filter((l) => l.stage === s.id);
    const done = linked.filter((l) => isDone(p, l.id)).length;
    return { id: s.id, done, total: linked.length, learned: done > 0 };
  });
}
