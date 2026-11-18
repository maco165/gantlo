import { describe, expect, it } from 'vitest';
import { STAGES, stageBars } from '../src/content/stages';

describe('リクエストの旅の 8 段', () => {
  it('8 段あり、id が重ならない', () => {
    expect(STAGES).toHaveLength(8);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(8);
  });

  it('帯の長さの比の合計が 100', () => {
    expect(STAGES.reduce((s, x) => s + x.weight, 0)).toBe(100);
  });

  it('帯は前の段の終わりから始まり、最後の帯が 100% で終わる (階段になる)', () => {
    const bars = stageBars();
    expect(bars[0].left).toBe(0);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].left).toBeCloseTo(bars[i - 1].left + bars[i - 1].width, 10);
    }
    const last = bars[bars.length - 1];
    expect(last.left + last.width).toBeCloseTo(100, 10);
  });
});
