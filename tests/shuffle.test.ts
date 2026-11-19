import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion } from '../src/content/types';
import { shuffleChoices } from '../src/lib/shuffle';
import { sampleLesson } from './fixtures/sample-lesson';

const choice = sampleLesson.questions.find((q): q is ChoiceQuestion => q.kind === 'choice')!;

/** 決まった並びの乱数 (テストで並びを固定する) */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('4 択の選択肢を混ぜる', () => {
  it('並びは変わるが、選択肢と正解の id は変わらず、元の問題も変えない', () => {
    const before = choice.choices.map((c) => c.id);
    const mixed = shuffleChoices(choice, seq([0, 0, 0]));
    expect(mixed.choices.map((c) => c.id)).not.toEqual(before);
    expect([...mixed.choices.map((c) => c.id)].sort()).toEqual([...before].sort());
    expect(mixed.answer).toBe(choice.answer);
    expect(choice.choices.map((c) => c.id)).toEqual(before);
  });

  it('混ぜるたびに並びが変わりうる (同じ並びばかりにならない)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(shuffleChoices(choice).choices.map((c) => c.id).join(''));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('fixedOrder の 4 択と、4 択でない問題はそのまま', () => {
    const fixed = { ...choice, fixedOrder: true };
    expect(shuffleChoices(fixed, seq([0])).choices).toEqual(choice.choices);
    const other = sampleLesson.questions[0];
    expect(shuffleChoices(other, seq([0]))).toBe(other);
  });
});
