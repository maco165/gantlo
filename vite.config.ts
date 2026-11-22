/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CATALOG_FIELDS } from './src/content/catalog-fields.ts';

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
        questions: (l.questions as { id: string }[]).map((q) => ({ id: q.id })),
      }));
      return `export default ${JSON.stringify({ lessons })};`;
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [lessonCatalog(), react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // vitest は base を / にするので、テストでも公開と同じ置き場所で経路を作る
    env: { BASE_URL: BASE },
  },
});
