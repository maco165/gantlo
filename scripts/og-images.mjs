// ページごとの共有のカードの画像 (OG 画像、1200×630 の PNG) を書き出す (npm run build の最後の段。prerender のあと)。
// 検索に載るページ (ホームを除く) の題を入れた画像を dist/<道>/og.png に書く。どのページが持つかと中身は src/prerender/og.ts。
// 組み立てた dist を Playwright の Chromium で開き (ポートは開かず、page.route で dist のファイルを返す)、サイトと同じ Gothic の
// トークンと書体 (public/fonts) で描く。日本語はサイトの書体に無いので、build のためだけに Noto Sans JP (devDependency の
// @fontsource-variable/noto-sans-jp。dist には入れない) を読ませる。書体を読めない・日本語が豆腐 (.notdef) になるときは build を止める。
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const JP_DIR = path.dirname(require.resolve('@fontsource-variable/noto-sans-jp/index.css'));
const HOST = 'https://og.invalid';
const started = Date.now();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let cards;
let BASE;
try {
  const { sitePages } = await server.ssrLoadModule('/src/prerender/pages.ts');
  const { ogCards, OG_WIDTH, OG_HEIGHT } = await server.ssrLoadModule('/src/prerender/og.ts');
  ({ BASE } = await server.ssrLoadModule('/src/lib/route.ts'));
  cards = { list: ogCards(sitePages()), width: OG_WIDTH, height: OG_HEIGHT };
} finally {
  await server.close();
}

function cardHtml(t) {
  return `
<style>
  @import url('${HOST}/__jp/index.css');
  html, body { margin: 0; background: ${t.body}; }
  .og { box-sizing: border-box; width: ${cards.width}px; height: ${cards.height}px; display: flex; flex-direction: column; justify-content: space-between;
    padding: 64px 72px 56px; background: ${t.body}; color: ${t.text}; font-family: ${t.font}, 'Noto Sans JP Variable', sans-serif; }
  .og * { box-sizing: border-box; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand img { width: 56px; height: 56px; }
  .brand b { font-family: ${t.display}; font-weight: 400; font-size: 64px; line-height: 1; }
  .kind { font-size: 28px; color: ${t.sub}; }
  .title { margin: 0; font-size: 60px; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .res { display: flex; align-items: baseline; gap: 24px; font-family: ${t.code}; }
  .req { font-size: 26px; color: ${t.sub}; }
  .st { font-size: 34px; font-weight: 600; color: ${t.success}; }
  .url { font-family: ${t.code}; font-size: 22px; color: ${t.accent}; }
</style>
<div class="og">
  <div class="top">
    <div class="brand"><img src="${BASE}favicon.svg" alt=""><b>gantlo</b></div>
    <div class="kind" data-og="kind"></div>
  </div>
  <p class="title" data-og="title"></p>
  <div>
    <div class="res"><span class="req" data-og="request"></span><span class="st">200 OK</span></div>
    <div class="url" data-og="url"></div>
  </div>
</div>`;
}

const browser = await chromium.launch();
let bytes = 0;
try {
  const page = await browser.newPage({ viewport: { width: cards.width, height: cards.height }, deviceScaleFactor: 1 });
  // dist と日本語の書体を、ポートを開かずに返す
  await page.route(`${HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    let file;
    if (url.pathname.startsWith('/__jp/')) file = path.join(JP_DIR, url.pathname.slice('/__jp/'.length));
    else if (url.pathname.startsWith(BASE)) {
      const rel = decodeURIComponent(url.pathname.slice(BASE.length));
      file = path.join(DIST, rel.endsWith('/') || rel === '' ? `${rel}index.html` : rel);
    }
    if (!file || !(file.startsWith(DIST) || file.startsWith(JP_DIR))) return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  // サイトの外へは取りに行かない
  await page.route((url) => !url.href.startsWith(HOST), (route) => route.abort());
  await page.goto(`${HOST}${BASE}`);
  await page.locator('.net__row').first().waitFor();
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('astryx-app-shell-main'));
    const v = (n) => cs.getPropertyValue(n).trim();
    return { body: v('--color-background-body'), text: v('--color-text-primary'), sub: v('--color-text-secondary'), accent: v('--color-accent'), success: v('--color-success'), font: v('--font-family-body'), display: v('--font-family-display'), code: v('--font-family-code') };
  });
  const missing = Object.entries(t).filter(([, x]) => !x).map(([k]) => k);
  if (missing.length) throw new Error(`og-images: テーマのトークンを読めませんでした: ${missing.join(', ')}`);
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, cardHtml(t));

  for (const card of cards.list) {
    await page.evaluate((c) => {
      for (const k of ['kind', 'title', 'request', 'url']) document.querySelector(`[data-og="${k}"]`).textContent = c[k];
    }, card);
    // 使う字の書体を読み終えるまで待ち、Gothic の 3 書体と (日本語があれば) Noto Sans JP が読めて、題の字が豆腐でないことを確かめる
    const problem = await page.evaluate(async (c) => {
      await document.fonts.ready;
      const og = document.querySelector('.og');
      const fams = (f) => [...document.fonts].filter((x) => x.family.replace(/['"]/g, '') === f);
      const loaded = (f) => fams(f).some((x) => x.status === 'loaded');
      for (const f of ['Fustat', 'JetBrains Mono', 'Manufacturing Consent']) if (!loaded(f)) return `書体 ${f} を読めていません`;
      if (/[　-ヿ一-鿿]/.test(`${c.kind}${c.title}${c.request}${c.url}`) && !loaded('Noto Sans JP Variable')) return '日本語の書体 (Noto Sans JP) を読めていません';
      // カードの字 (種類・題・要求の行・URL) を、要素ごとの書体で 1 つずつ canvas に描き、どの書体にも無い字 (.notdef の豆腐) と同じ絵なら止める
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const draw = (font, ch) => {
        ctx.clearRect(0, 0, 80, 80);
        ctx.font = font;
        ctx.fillText(ch, 8, 60);
        return ctx.getImageData(0, 0, 80, 80).data.join(',');
      };
      for (const el of document.querySelectorAll('[data-og]')) {
        const font = getComputedStyle(el).font.replace(/\d+px\/[\d.]+px|\d+px/, '48px');
        const tofu = draw(font, '\u{10FFFD}');
        const bad = [...new Set([...el.textContent].filter((ch) => ch.trim()))].filter((ch) => draw(font, ch) === tofu);
        if (bad.length) return `${el.getAttribute('data-og')} の字が豆腐になります: ${bad.join(' ')}`;
      }
      if (og.scrollWidth > og.clientWidth) return '横にはみ出しています';
      return null;
    }, card);
    if (problem) throw new Error(`og-images: ${card.path}: ${problem}`);
    const out = path.join(DIST, card.path, 'og.png');
    if (!out.startsWith(DIST)) throw new Error(`og-images: 道の形が違います (${card.path})`);
    await page.locator('.og').screenshot({ path: out });
    bytes += (await stat(out)).size;
  }
  await page.close();
} finally {
  await browser.close();
}
console.log(`og-images: ${cards.list.length} 枚 (合計 ${(bytes / 1024).toFixed(0)} KB) を ${((Date.now() - started) / 1000).toFixed(1)} 秒で書きました`);
