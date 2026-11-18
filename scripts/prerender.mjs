// vite build のあとに、ページごとの HTML を dist に書き出す (npm run build の最後の段)。
// GitHub Pages は dist/<道>/index.html があれば HTTP 200 で返すので、下層の URL (/gantlo/plan/ など) も 200 になる。
// 検索エンジンと SNS が JS を動かさなくても、題・説明・canonical・本文の見出しを読めるようにする。
// ページの一覧と HTML の組み立ては src/prerender/ にあり (tests/meta.test.ts も同じものを見る)、ここは vite で読んで書くだけ。
// 知らない道は、GitHub Pages が 404.html を HTTP 404 で返す。画面は JS で 404 を出す。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// fileURLToPath を使う (URL の pathname のままだと、空白や日本語を含む場所で %20 などが残って開けない)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// ポートは開かない (middlewareMode・hmr なし)。vite.config.ts の base (/gantlo/) と import.meta.glob をそのまま使うために vite で読む
const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const { sitePages, NOT_FOUND_PAGE } = await server.ssrLoadModule('/src/prerender/pages.ts');
  const { renderPage, sitemapXml } = await server.ssrLoadModule('/src/prerender/html.ts');
  const template = await readFile(path.join(DIST, 'index.html'), 'utf8');
  const pages = sitePages();
  for (const page of pages) {
    // 道は英小文字・数字・- と / だけ (レッスンの id は check-content が同じ形に限る)。dist の外へ書かない
    if (!/^(?:[a-z0-9-]+\/)*$/.test(page.path)) throw new Error(`prerender: 道の形が違います (${page.path})`);
    const dir = path.join(DIST, page.path);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderPage(template, page));
  }
  await writeFile(path.join(DIST, '404.html'), renderPage(template, NOT_FOUND_PAGE, { noindex: true }));
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemapXml(pages));
  console.log(`prerender: ${pages.length} ページと 404.html・sitemap.xml を書きました`);
} finally {
  await server.close();
}
