// @vitest-environment node
// e2e の「並べ替えを正しくない答えで送る」(scripts/e2e-lessons.mjs の unsortedTarget) が、どの始めの並びからでも 409 になる並びを返すか。
// 前は正しい順の先頭の項目を一番上へ送るだけで、始めの並びによっては正しい順になって 200 が出た (5 項目でおよそ 3%)。
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gradeOrder } from '../src/lib/order';
import { orderStatus } from '../src/lib/status';

type Unsorted = (current: readonly string[], answer: readonly string[]) => string[];
const load = async () => ((await import(pathToFileURL(join(__dirname, '../scripts/e2e-lessons.mjs')).href)) as { unsortedTarget: Unsorted }).unsortedTarget;

/** items の並びをすべて */
function permutations(items: readonly string[]): string[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

describe('unsortedTarget (e2e の並べ替えの不正解)', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    it(`${n} 項目: どの始めの並び (${permutations(Array.from({ length: n }, (_, i) => `i${i}`)).length} 通り) からでも、同じ項目の、正しい順と違う並びを返し 409 になる`, async () => {
      const unsortedTarget = await load();
      const answer = Array.from({ length: n }, (_, i) => `i${i}`);
      for (const start of permutations(answer)) {
        const target = unsortedTarget(start, answer);
        expect([...target].sort(), start.join(',')).toEqual([...answer].sort());
        const grade = gradeOrder({ answer }, target);
        expect(grade.correct, start.join(',')).toBe(false);
        expect(orderStatus(grade.misplaced).code, start.join(',')).toBe(409);
        // 3 項目以上では、正しい位置の行と違う位置の行が両方ある (e2e.mjs の 409 の色の検査が使う)
        if (n >= 3) expect(grade.misplaced, start.join(',')).toBeLessThan(n);
      }
    });
  }

  it('前の作り (先頭の項目を上へ送るだけ) で 200 になっていた始めの並びも 409 にする', async () => {
    const unsortedTarget = await load();
    const answer = ['a', 'b', 'c', 'd', 'e'];
    // 先頭の項目 a の位置だけが違う並び。a を上へ送ると正しい順になってしまう
    const start = ['b', 'c', 'a', 'd', 'e'];
    expect(unsortedTarget(start, answer)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
});
