/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CATALOG_FIELDS } from './src/content/catalog-fields.ts';
import { purgeAtomicCssPlugin } from './scripts/purge-atomic-css.ts';

// GitHub Pages では https://maco165.github.io/gantlo/ に置かれる。
const BASE = '/gantlo/';

/**
 * 問題データの JSON を `?catalog` 付きで読むと、目録 (レッスンの id・題・コース・段と問題の id) だけを返す。
 * ホームが静的に読むのは目録だけにして、問題の本文・答え・解説は画面を開いたときに読む (src/content/catalog.ts)
 */
function lessonCatalog(): Plugin {
  const SUFFIX = '.json?catalog';
  return {
    name: 'gantlo-lesson-catalog',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -'?catalog'.length);
      this.addWatchFile(file);
      const data = JSON.parse(readFileSync(file, 'utf8')) as { lessons: Record<string, unknown>[] };
      const lessons = data.lessons.map((l) => ({
        ...Object.fromEntries(CATALOG_FIELDS.filter((k) => l[k] !== undefined).map((k) => [k, l[k]])),
        // 実習 (採点しない) には lab を付ける (進捗の画面が、問題の本文を読まずに採点する問題を数えるため)
        questions: (l.questions as { id: string; kind: string }[]).map((q) => (q.kind === 'lab' ? { id: q.id, lab: true } : { id: q.id })),
      }));
      return `export default ${JSON.stringify({ lessons })};`;
    },
  };
}

export default defineConfig({
  base: BASE,
  // purgeAtomicCssPlugin: 使われない StyleX の原子クラスを CSS から落とす (scripts/purge-atomic-css.ts)
  plugins: [lessonCatalog(), react(), purgeAtomicCssPlugin(fileURLToPath(new URL('./src', import.meta.url)))],
  // 書き出す HTML に、ページの画面の JS を先に取りに行く modulepreload を入れるため (scripts/prerender.mjs が読む)
  build: { manifest: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // vitest は base を / にするので、テストでも公開と同じ置き場所で経路を作る
    env: { BASE_URL: BASE },
  },
});
