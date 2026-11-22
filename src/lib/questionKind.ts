// 問題の種類の呼び名の正本。問題の画面の見出し (src/components/*QuestionView.tsx) と、
// 書き出す HTML の問題の一覧 (src/prerender/pages.ts) が同じ呼び名を使う
import type { Question } from '../content/types';

export const KIND_LABELS = {
  command: 'コマンドの穴埋め',
  http: 'HTTP の穴埋め',
  json: 'JSON の穴埋め',
  choice: '4 択',
  order: '並べ替え',
  lab: '実習',
} as const;

/** 問題 1 つの種類の呼び名 (HTTP の穴埋めは HTTP と JSON を分ける) */
export function kindLabel(q: Question): string {
  if (q.kind === 'http') return KIND_LABELS[q.format];
  return KIND_LABELS[q.kind];
}
