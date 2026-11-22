// 読み込みを速くする仕組みの検査: ページの画面の JS を先に取りに行く (prerender/preload.ts)、レッスンの画面はそのレッスンのファイルだけを読む (content/lesson.ts)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG, LESSON_FILE } from '../src/content/catalog';
import { LESSONS } from '../src/content/index';
import { loadLesson } from '../src/content/lesson';
import { preloadKeys, preloadLinks, type Manifest } from '../src/prerender/preload';

const ROOT = join(__dirname, '..');

describe('ページの画面の JS を先に取りに行く (modulepreload)', () => {
  const manifest: Manifest = {
    'index.html': { file: 'assets/index-1.js', isEntry: true, imports: ['_shared-1.js'] },
    '_shared-1.js': { file: 'assets/shared-1.js' },
    'src/screens/LessonPage.tsx': { file: 'assets/LessonPage-1.js', imports: ['index.html', '_shared-1.js', '_LessonScreen-1.js'] },
    '_LessonScreen-1.js': { file: 'assets/LessonScreen-1.js', imports: ['_shared-1.js'] },
    '_week1-1.js': { file: 'assets/week1-1.js' },
    'src/screens/Glossary.tsx': { file: 'assets/Glossary-1.js', imports: ['index.html'] },
  };
  const template = '<script type="module" crossorigin src="/gantlo/assets/index-1.js"></script><link rel="modulepreload" crossorigin href="/gantlo/assets/shared-1.js">';

  it('レッスンのページは、レッスンの画面の JS とそのレッスンを持つ問題データを取りに行き、型が読むものは重ねない', () => {
    const lesson = CATALOG.find((l) => LESSON_FILE.get(l.id)?.endsWith('/week1.json'))!;
    expect(preloadKeys(`lesson/${lesson.id}/`, manifest)).toEqual(['src/screens/LessonPage.tsx', '_week1-1.js']);
    expect(preloadLinks(`lesson/${lesson.id}/`, manifest, template)).toEqual([
      '<link rel="modulepreload" crossorigin href="/gantlo/assets/LessonPage-1.js">',
      '<link rel="modulepreload" crossorigin href="/gantlo/assets/LessonScreen-1.js">',
      '<link rel="modulepreload" crossorigin href="/gantlo/assets/week1-1.js">',
    ]);
  });

  it('用語集はその画面の JS だけ、ホームはホームの画面の JS、知らない道は何もしない', () => {
    expect(preloadLinks('glossary/', manifest, template)).toEqual(['<link rel="modulepreload" crossorigin href="/gantlo/assets/Glossary-1.js">']);
    expect(preloadLinks('', { ...manifest, 'src/screens/Home.tsx': { file: 'assets/Home-1.js', imports: ['index.html'] } }, template)).toEqual(['<link rel="modulepreload" crossorigin href="/gantlo/assets/Home-1.js">']);
    expect(preloadLinks('no-such/', manifest, template)).toEqual([]);
  });

  it('組み立てた dist のレッスンのページは、そのレッスンの問題データの chunk を modulepreload する (npm run build のあと)', () => {
    const html = readFileSync(join(ROOT, 'dist/lesson/main-w1-l1/index.html'), 'utf8');
    expect(html).toMatch(/<link rel="modulepreload" crossorigin href="\/gantlo\/assets\/LessonPage-[\w-]+\.js">/);
    expect(html).toMatch(/<link rel="modulepreload" crossorigin href="\/gantlo\/assets\/week1-[\w-]+\.js">/);
    expect(html).not.toMatch(/week2-/);
  });
});

describe('レッスンの画面は、そのレッスンを持つファイルだけを読む', () => {
  it('どのレッスンも、目録の LESSON_FILE で引いたファイルから全部のデータと同じ中身が読める', async () => {
    expect(LESSON_FILE.size).toBe(LESSONS.length);
    for (const l of LESSONS) expect(await loadLesson(l.id), l.id).toEqual(l);
  });

  it('同じレッスンは同じ Promise を返し (React の use で待つため)、知らない id は undefined', async () => {
    expect(loadLesson(LESSONS[0].id)).toBe(loadLesson(LESSONS[0].id));
    await expect(loadLesson('no-such-lesson')).resolves.toBeUndefined();
  });
});
