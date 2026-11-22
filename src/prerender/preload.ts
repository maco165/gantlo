// 書き出すページごとに、その画面の JS (とレッスンなら問題データ) を先に取りに行く <link rel="modulepreload"> を作る。
// 画面の JS は開いたときに読む (App.tsx の lazy) ので、何もしないと index.js を読んで動かしてから取りに行く直列になる。
// どのファイルかは vite の manifest (dist/.vite/manifest.json) で引く。scripts/prerender.mjs が使う。
import { LESSON_FILE } from '../content/catalog';
import { BASE } from '../lib/route';

export type ManifestChunk = { file: string; imports?: string[]; isEntry?: boolean };
export type Manifest = Record<string, ManifestChunk>;

/** 画面のファイル (App.tsx の lazy の先)。道の頭で引く (ホームの道 '' は src/screens/Home.tsx) */
const SCREENS: Record<string, string> = {
  lesson: 'src/screens/LessonPage.tsx',
  course: 'src/screens/CourseScreen.tsx',
  plan: 'src/screens/Plan.tsx',
  review: 'src/screens/Review.tsx',
  exam: 'src/screens/Exam.tsx',
  progress: 'src/screens/ProgressScreen.tsx',
  glossary: 'src/screens/Glossary.tsx',
  settings: 'src/screens/Settings.tsx',
  about: 'src/screens/About.tsx',
};

/** 道 (BASE からの相対) から、先に取りに行く manifest の鍵 (画面、レッスンならそのレッスンを持つ問題データ) */
export function preloadKeys(path: string, manifest: Manifest): string[] {
  const [head, id] = path.split('/');
  const screen = path === '' ? 'src/screens/Home.tsx' : SCREENS[head];
  if (!screen) return [];
  const keys = [screen];
  if (head === 'lesson' && id) {
    const file = LESSON_FILE.get(id);
    if (!file) throw new Error(`preload: レッスン ${id} の問題データのファイルが目録にありません`);
    const base = file.replace(/^.*\//, '').replace(/\.json$/, '');
    // 問題データは全部のデータ (content/index.ts) からも読むので、manifest では共有の chunk (_<名前>-<hash>.js) になる
    const hits = Object.keys(manifest).filter((k) => manifest[k].file.startsWith(`assets/${base}-`));
    if (hits.length !== 1) throw new Error(`preload: ${file} の chunk が 1 つに決まりません (${hits.join(', ')})`);
    keys.push(hits[0]);
  }
  return keys;
}

/**
 * 鍵とその import をたどった JS のうち、型 (index.html) がもう読んでいるもの以外の modulepreload の行。
 * 型の entry (index.html) から先はたどらない (型が読む)
 */
export function preloadLinks(path: string, manifest: Manifest, template: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  const walk = (key: string) => {
    if (seen.has(key) || key === 'index.html') return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`preload: manifest に ${key} がありません`);
    files.push(chunk.file);
    for (const k of chunk.imports ?? []) walk(k);
  };
  for (const k of preloadKeys(path, manifest)) walk(k);
  return files.filter((f) => !template.includes(`${BASE}${f}"`)).map((f) => `<link rel="modulepreload" crossorigin href="${BASE}${f}">`);
}
