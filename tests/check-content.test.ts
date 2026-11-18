// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/content/stages';
import { COURSES } from '../src/lib/route';

const SCRIPT = join(__dirname, '../scripts/check-content.mjs');
const SAMPLE = join(__dirname, '../src/content/courses/main/week1.json');

function run(file?: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, ...(file ? [file] : [])], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
}

/** 見本のデータの写しを一時フォルダに置いて変える (本物は変えない) */
function mutate(name: string, fn: (d: any) => void): string {
  const data = JSON.parse(readFileSync(SAMPLE, 'utf8'));
  fn(data);
  const file = join(mkdtempSync(join(tmpdir(), 'gantlo-content-')), `${name}.json`);
  writeFileSync(file, JSON.stringify(data));
  return file;
}

const q = (d: any, i: number) => d.lessons[0].questions[i];

// node を何度も起こすので、重い機械や CI でも落ちないよう 1 件 30 秒まで待つ
describe('check-content', { timeout: 30_000 }, () => {
  it('本物のデータは OK で終了コード 0', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^OK .*week1\.json/m);
    expect(r.out).not.toContain('NG');
  });

  it('必須の欄 (id・種類・問題文・解説・出典) を 1 つ消すと NG (ファイル名と id を出す)', () => {
    for (const key of ['id', 'kind', 'prompt', 'explanation', 'sources']) {
      const r = run(mutate(`no-${key}`, (d) => delete q(d, 1)[key]));
      expect(r.code, key).toBe(1);
      // id を消した問題は、レッスンの id と何問目かで指す
      expect(r.out, key).toMatch(new RegExp(`^NG .*no-${key}\\.json main-w1-l1(-q2|\\.questions\\[1\\]): `, 'm'));
    }
  });

  it('種類ごとの正解の欄を消すと NG', () => {
    const cases: [string, number, string][] = [
      ['command', 0, 'blanks'],
      ['http', 1, 'blanks'],
      ['order', 2, 'answer'],
      ['choice', 3, 'answer'],
      ['lab', 4, 'expected'],
    ];
    for (const [kind, i, key] of cases) {
      const r = run(mutate(`no-answer-${kind}`, (d) => delete q(d, i)[key]));
      expect(r.code, kind).toBe(1);
      expect(r.out, kind).toMatch(new RegExp(`^NG .*no-answer-${kind}\\.json main-w1-l1-q${i + 1}: ${key}`, 'm'));
    }
    const emptyAlt = run(mutate('empty-answers', (d) => (q(d, 0).blanks[0].answers = [])));
    expect(emptyAlt.out).toMatch(/NG .*empty-answers\.json main-w1-l1-q1: blanks\[0\]\.answers/);
  });

  it('4 択の正解が選択肢に無いと NG', () => {
    const r = run(mutate('bad-choice', (d) => (q(d, 3).answer = 'z')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*bad-choice\.json main-w1-l1-q4: 正解 \(z\) が選択肢にありません/m);
  });

  it('並べ替えの正解の順が項目と合わないと NG (足りない・知らない id・重なり)', () => {
    const cases: [string, (a: string[]) => string[]][] = [
      ['order-short', (a) => a.slice(0, 3)],
      ['order-unknown', (a) => [...a.slice(0, 3), 'udp']],
      ['order-dup', (a) => [a[0], a[0], a[2], a[3]]],
    ];
    for (const [name, change] of cases) {
      const r = run(mutate(name, (d) => (q(d, 2).answer = change(q(d, 2).answer))));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(new RegExp(`^NG .*${name}\\.json main-w1-l1-q3: 正解の順`, 'm'));
    }
    // 並びを入れ替えただけなら、検査は通す (正しい順かは書く人と見る人が決める)
    expect(run(mutate('order-swap', (d) => q(d, 2).answer.reverse())).code).toBe(0);
  });

  it('問題 id が重複すると NG', () => {
    const r = run(mutate('dup-id', (d) => (q(d, 1).id = 'main-w1-l1-q1')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*dup-id\.json main-w1-l1-q1: id が重複しています/m);
  });

  it('レッスンの旅の段が stages.ts に無いと NG。本編では段が要る', () => {
    const r = run(mutate('bad-stage', (d) => (d.lessons[0].stage = 'udp')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*bad-stage\.json main-w1-l1: stage \(udp\) が src\/content\/stages\.ts にありません/m);
    expect(run(mutate('no-stage', (d) => delete d.lessons[0].stage)).out).toMatch(/main-w1-l1: stage \(旅の段\) がありません/);
    // 本編以外のコースは段が無くてよい
    const other = (d: any) => {
      d.lessons[0].course = 'mgmt-history';
      delete d.lessons[0].stage;
    };
    expect(run(mutate('other-course', other)).code).toBe(0);
  });

  it('出典が https でないと NG', () => {
    const r = run(mutate('http-source', (d) => (q(d, 3).sources = ['http://www.rfc-editor.org/rfc/rfc9110'])));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*http-source\.json main-w1-l1-q4: sources\[0\] が https の URL ではありません/m);
    expect(run(mutate('empty-sources', (d) => (q(d, 3).sources = []))).out).toMatch(/main-w1-l1-q4: sources/);
  });

  it('穴埋めの空欄の数が合わないと NG', () => {
    expect(run(mutate('cmd-two', (d) => (q(d, 0).code += ' {{blank}}'))).out).toMatch(/main-w1-l1-q1: code の \{\{blank\}\} はちょうど 1 つ/);
    expect(run(mutate('http-three', (d) => (q(d, 1).code += '\n{{blank}}'))).out).toMatch(/main-w1-l1-q2: code の \{\{blank\}\} は 1〜2 つ/);
    expect(run(mutate('http-blanks', (d) => q(d, 1).blanks.pop())).out).toMatch(/main-w1-l1-q2: blanks の数 \(1\) が/);
  });

  it('知らない種類・コース・match と、id の形の違いは NG', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['bad-kind', (d) => (q(d, 0).kind = 'fill'), /main-w1-l1-q1: kind は/],
      ['bad-course', (d) => (d.lessons[0].course = 'k8s'), /main-w1-l1: course は/],
      ['bad-match', (d) => (q(d, 1).blanks[0].match = 'header'), /main-w1-l1-q2: blanks\[0\]\.match は/],
      ['bad-id', (d) => (q(d, 0).id = 'Main_Q1'), /Main_Q1: id は英小文字/],
      ['bad-prefix', (d) => (q(d, 0).id = 'other-q1'), /other-q1: 問題の id はレッスンの id/],
      ['bad-tool', (d) => (q(d, 0).tool = 'wget'), /main-w1-l1-q1: tool は/],
    ];
    for (const [name, fn, re] of cases) {
      const r = run(mutate(name, fn));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(re);
    }
  });

  it('JSON として読めないファイルは NG', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'gantlo-content-')), 'broken.json');
    writeFileSync(file, '{"lessons": [');
    const r = run(file);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*broken\.json -: JSON として読めません/m);
  });

  it('知らない欄 (打ち間違い) は NG', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['typo-match', (d) => (q(d, 1).blanks[0].Match = 'header-name'), /main-w1-l1-q2: 知らない欄 \(blanks\[0\]\.Match\) です/],
      ['typo-fixedorder', (d) => (q(d, 3).fixedorder = true), /main-w1-l1-q4: 知らない欄 \(fixedorder\) です/],
      ['typo-whyy', (d) => (q(d, 3).choices[1].whyy = '違う'), /main-w1-l1-q4: 知らない欄 \(choices\[1\]\.whyy\) です/],
      ['typo-source', (d) => (q(d, 0).source = 'https://curl.se/'), /main-w1-l1-q1: 知らない欄 \(source\) です/],
      ['typo-other-kind', (d) => (q(d, 0).items = []), /main-w1-l1-q1: 知らない欄 \(items\) です/],
      ['typo-lesson', (d) => (d.lessons[0].stages = 'http'), /main-w1-l1: 知らない欄 \(stages\) です/],
      ['typo-file', (d) => (d.lesson = []), /NG \S+ -: 知らない欄 \(lesson\) です/],
      ['typo-item', (d) => (q(d, 2).items[0].txt = 'x'), /main-w1-l1-q3: 知らない欄 \(items\[0\]\.txt\) です/],
      ['typo-step', (d) => (q(d, 4).steps[0].cmd = 'ls'), /main-w1-l1-q5: 知らない欄 \(steps\[0\]\.cmd\) です/],
      ['typo-code', (d) => (q(d, 3).code = { format: 'http', text: 'x', lang: 'y' }), /main-w1-l1-q4: 知らない欄 \(code\.lang\) です/],
    ];
    for (const [name, fn, re] of cases) {
      const r = run(mutate(name, fn));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(re);
    }
  });

  it('検査が読む段とコースの id は、stages.ts と route.ts の正本と同じ', async () => {
    const mod = await import(pathToFileURL(SCRIPT).href);
    expect(mod.readIds('src/content/stages.ts', 'STAGES')).toEqual(STAGES.map((s) => s.id));
    expect(mod.readIds('src/lib/route.ts', 'COURSES')).toEqual(COURSES.map((c) => c.id));
  });
});
