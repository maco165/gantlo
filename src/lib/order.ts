// 並べ替えの問題の計算 (画面から切り離してテストする)。並びは項目の id の配列で持つ。
import type { OrderQuestion } from '../content/types';
import { shuffled } from './shuffle';

/** 採点の結果。rows は並べた順の行ごとに、正しい位置にあるか */
export type OrderGrade = { correct: boolean; misplaced: number; rows: boolean[] };

/** 並べた順 (id の配列) を正しい順と比べる。全部の行が正しい位置なら正解、ずれた行の数も返す */
export function gradeOrder(q: Pick<OrderQuestion, 'answer'>, arranged: readonly string[]): OrderGrade {
  const rows = q.answer.map((id, i) => arranged[i] === id);
  const misplaced = rows.filter((ok) => !ok).length;
  return { correct: arranged.length === q.answer.length && misplaced === 0, misplaced, rows };
}

/** 混ぜ直す回数の上限。乱数が偏って (テストで固定したときなど) 正しい順ばかり出ても止まるようにする */
const MAX_RESHUFFLE = 100;

/**
 * 最初に出す並び。項目を混ぜ、正しい順と同じ間は混ぜ直す (正しい順を除く並びがどれも同じ割合で出る)。
 * 上限まで混ぜても正しい順のままなら 1 つずらす。重ならない id を 1 つずらした並びは元と必ず違うので、
 * 項目が 2 つ以上なら正解の並びでは始まらない
 */
export function initialOrder(q: Pick<OrderQuestion, 'items' | 'answer'>, random: () => number = Math.random): string[] {
  const base = q.items.map((it) => it.id);
  const isAnswer = (ids: readonly string[]) => ids.every((id, i) => id === q.answer[i]);
  let ids = shuffled(base, random);
  if (ids.length < 2) return ids;
  for (let i = 0; i < MAX_RESHUFFLE && isAnswer(ids); i++) ids = shuffled(base, random);
  if (isAnswer(ids)) ids.push(ids.shift()!);
  return ids;
}

/** 項目を最初に出す並び (initialOrder) にした写しを返す。元の問題は変えない */
export function shuffleItems(q: OrderQuestion, random: () => number = Math.random): OrderQuestion {
  const order = initialOrder(q, random);
  return { ...q, items: order.map((id) => q.items.find((it) => it.id === id)!) };
}

/** index の行を delta (-1 で上、+1 で下) だけ動かした写し。端から先へは動かさない */
export function moveItem(order: readonly string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= order.length || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** 項目の id を正しい順での位置 (0 始まり) に引く表。帯を正しい位置に描くのに使う */
export function answerIndex(q: Pick<OrderQuestion, 'answer'>): Record<string, number> {
  return Object.fromEntries(q.answer.map((id, i) => [id, i]));
}
