import { describe, expect, it } from 'vitest';
import { findLesson } from '../src/content/index';
import type { OrderQuestion } from '../src/content/types';
import { answerIndex, gradeOrder, initialOrder, moveItem, shuffleItems } from '../src/lib/order';

const sample = findLesson('main-w1-l1')!.questions.find((q): q is OrderQuestion => q.kind === 'order')!;

/** テストの中で作る並べ替えの問題 (項目の数を変えて確かめる) */
function make(n: number): OrderQuestion {
  const ids = Array.from({ length: n }, (_, i) => `s${i + 1}`);
  return {
    id: `t-q${n}`,
    kind: 'order',
    prompt: '起きる順に並べてください。',
    items: ids.map((id) => ({ id, text: `段 ${id}` })),
    answer: ids,
    explanation: '説明',
    sources: ['https://example.com/'],
  };
}

/** 決まった並びの乱数 (テストで並びを固定する) */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('並べ替えの採点', () => {
  it('全部の行が正しい位置なら正解で、ずれた行は 0', () => {
    expect(gradeOrder(sample, sample.answer)).toEqual({ correct: true, misplaced: 0, rows: [true, true, true, true] });
  });

  it('1 つでもずれれば不正解で、ずれた行の数と行ごとの正誤を返す', () => {
    const [a, b, c, d] = sample.answer;
    expect(gradeOrder(sample, [b, a, c, d])).toEqual({ correct: false, misplaced: 2, rows: [false, false, true, true] });
    expect(gradeOrder(sample, [d, b, c, a])).toMatchObject({ correct: false, misplaced: 2 });
    expect(gradeOrder(sample, [b, c, d, a])).toMatchObject({ correct: false, misplaced: 4 });
  });

  it('項目が足りない並びは正解にしない', () => {
    expect(gradeOrder(sample, sample.answer.slice(0, 3))).toMatchObject({ correct: false, misplaced: 1 });
  });
});

describe('開いたときの並び', () => {
  it('乱数がどう出ても、項目が 2 つ以上なら正解と同じ並びでは始まらない', () => {
    // 0 ばかり・1 に近い値ばかり (Fisher-Yates が何も動かさない並びを含む) でも、正解の並びにならない
    const randoms = [() => 0.999999, () => 0, seq([0.5]), seq([0.1, 0.9, 0.4])];
    for (const n of [2, 3, 4, 7])
      for (const r of randoms) {
        const q = make(n);
        const order = initialOrder(q, r);
        expect(order).not.toEqual(q.answer);
        expect([...order].sort()).toEqual([...q.answer].sort());
      }
  });

  it('開くたびに (本物の乱数で 200 回) 正解と違う並びから始まり、並びは 1 通りに偏らない', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const order = initialOrder(sample);
      expect(order).not.toEqual(sample.answer);
      seen.add(order.join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('項目が 1 つなら、そのまま 1 つの並び', () => {
    expect(initialOrder(make(1), () => 0)).toEqual(['s1']);
  });

  it('shuffleItems は項目を混ぜた写しを返し、元の問題と正しい順は変えない', () => {
    const before = sample.items.map((it) => it.id);
    const mixed = shuffleItems(sample, () => 0.999999);
    expect(mixed.items.map((it) => it.id)).not.toEqual(sample.answer);
    expect(mixed.answer).toEqual(sample.answer);
    expect(sample.items.map((it) => it.id)).toEqual(before);
    expect(mixed.items.every((it) => sample.items.includes(it))).toBe(true);
  });
});

describe('上下に動かす', () => {
  const order = ['a', 'b', 'c'];
  it('上へ・下へで隣と入れ替わり、元の並びは変えない', () => {
    expect(moveItem(order, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(order, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(order).toEqual(['a', 'b', 'c']);
  });
  it('端から先へは動かない', () => {
    expect(moveItem(order, 0, -1)).toEqual(order);
    expect(moveItem(order, 2, 1)).toEqual(order);
  });
  it('動かし続ければ正解の並びにできる', () => {
    let o = ['c', 'a', 'b'];
    o = moveItem(o, 1, -1); // a c b
    o = moveItem(o, 2, -1); // a b c
    expect(gradeOrder({ answer: ['a', 'b', 'c'] }, o).correct).toBe(true);
  });
});

describe('帯の位置', () => {
  it('項目ごとの正しい順での位置を引ける', () => {
    expect(answerIndex(sample)).toEqual(Object.fromEntries(sample.answer.map((id, i) => [id, i])));
  });
});
