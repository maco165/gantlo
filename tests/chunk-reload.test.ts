import { describe, expect, it } from 'vitest';
import { RELOAD_KEY, RELOAD_WINDOW_MS, shouldReload } from '../src/lib/chunkReload';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('画面のチャンクを読めなかったときの読み直し (1 回だけ)', () => {
  it('初めては読み直し、時刻を残す。同じ時間の中の 2 度目は読み直さず、時間が過ぎればまた読み直す', () => {
    const s = memory();
    expect(shouldReload(s, 1_000)).toBe(true);
    expect(s.m.get(RELOAD_KEY)).toBe('1000');
    expect(shouldReload(s, 1_000 + RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(shouldReload(s, 1_000 + RELOAD_WINDOW_MS)).toBe(true);
  });

  it('sessionStorage が使えなければ読み直さない (繰り返しを止められないため)', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(shouldReload(broken, 1_000)).toBe(false);
  });
});
