#!/usr/bin/env node
// README の画像を作り直す: npm run readme:images (vite build のあと、このスクリプトが撮る)
// - docs/images/banner.png: README の先頭の帯の画像。色と字体は、組み立てたサイトの Gothic テーマのトークンを画面から読んで使う
//   (gantlo は暗い画面だけなので、帯も暗い 1 枚だけ。README の picture は明るい側にも同じ画像を出す)
// - public/og.png: URL を共有したときのカードの画像 (1200×630。og:image)。帯と同じトークンと字体で描く
// - public/apple-touch-icon.png: iOS のホーム画面の画像 (180×180)。favicon.svg の図柄を、角を落とさず不透明の地に描く (iOS は透明を黒で埋め、角は自分で丸めるため)
// - docs/images/*.png: 組み立てた dist を vite preview で配り、見本の進捗を入れた状態で撮った画面 (スマホ 390 幅と PC 1280 幅)
// 画面を変えたら走らせ直し、画像も同じ PR でコミットする。
// 番号は README_IMAGES_PORT (既定 4331)。埋まっていれば --strictPort で止まるので、空いている番号を渡す。
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { answer, loadLessons } from './e2e-lessons.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = new URL('../docs/images/', import.meta.url).pathname;
const OG = new URL('../public/og.png', import.meta.url).pathname;
const TOUCH_ICON = new URL('../public/apple-touch-icon.png', import.meta.url).pathname;
const PORT = Number(process.env.README_IMAGES_PORT ?? 4331);
const BASE = `http://localhost:${PORT}/gantlo/`;
mkdirSync(OUT, { recursive: true });

const LESSONS = loadLessons();
const lessonById = (id) => {
  const l = LESSONS.find((x) => x.id === id);
  if (!l) throw new Error(`問題データに ${id} がありません (撮るレッスンを選び直す)`);
  return l;
};
/** 穴埋めの不正解 (400) を撮るレッスンと、並べ替えの正解 (階段の帯) を撮るレッスン */
const FILL_LESSON = lessonById('main-w1-l1');
const ORDER_LESSON = lessonById('main-w1-l2');

/** 帯の画像の中身。t は画面から読んだトークン */
function bannerHtml(t) {
  return `
<style>
  .banner { box-sizing: border-box; width: 1280px; height: 360px; display: flex; gap: 56px; align-items: center; padding: 0 72px;
    background: ${t.body}; color: ${t.text}; font-family: ${t.font}; }
  .banner * { box-sizing: border-box; }
  .lead { flex: 1 1 0; display: flex; flex-direction: column; gap: 14px; }
  .eyebrow { font-size: 17px; color: ${t.sub}; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand img { width: 56px; height: 56px; }
  .brand h1 { margin: 0; font-family: ${t.display}; font-weight: 400; font-size: 72px; line-height: 1; }
  .lead p { margin: 0; font-size: 20px; line-height: 1.6; color: ${t.sub}; }
  .card { flex: 0 0 470px; background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 8px; overflow: hidden; font-family: ${t.code}; }
  .req { padding: 10px 16px; border-bottom: 1px solid ${t.border}; font-size: 14px; color: ${t.sub}; }
  .st { padding: 14px 16px 6px; font-size: 26px; font-weight: 600; color: ${t.success}; }
  .st span { font-size: 17px; margin-left: 10px; }
  .rows { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .row { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 12px; font-size: 14px; color: ${t.sub}; }
  .bar { height: 12px; border-radius: 2px; background: ${t.accent}; }
  .bar.done { background: ${t.success}; }
</style>
<div class="banner">
  <div class="lead">
    <div class="eyebrow">API と HTTP の基礎 · 問題を解いて学ぶサイト</div>
    <div class="brand"><img src="${BASE}favicon.svg" alt=""><h1>gantlo</h1></div>
    <p>HTTP・DNS・TLS・REST・OAuth を、問題を解いて学ぶ。<br>計画はガントチャートで、進捗はブラウザの中だけに。</p>
  </div>
  <div class="card">
    <div class="req">GET /me/lessons</div>
    <div class="st">206<span>Partial Content</span></div>
    <div class="rows">
      <div class="row">HTTP と URI<div class="bar done" style="width:38%"></div></div>
      <div class="row">DNS と TLS<div class="bar" style="width:30%;margin-left:38%"></div></div>
      <div class="row">REST と OpenAPI<div class="bar" style="width:22%;margin-left:68%"></div></div>
      <div class="row">OAuth と JWT<div class="bar" style="width:10%;margin-left:90%"></div></div>
    </div>
  </div>
</div>`;
}

/** iOS のホーム画面の画像 (180×180) の中身。favicon.svg の角の丸み (rx) を外し、地の色で四隅まで塗る */
function touchIconHtml(svg) {
  const square = svg.replace(/(<rect width="32" height="32") rx="[^"]*"/, '$1');
  return `<style>html,body{margin:0}.icon{width:180px;height:180px;background:#101314}.icon svg{display:block;width:180px;height:180px}</style><div class="icon">${square}</div>`;
}

/** 共有用の画像 (1200×630) の中身。帯と同じ部品を、カードの形に縦に並べる。t は画面から読んだトークン */
function ogHtml(t) {
  return `
<style>
  .og { box-sizing: border-box; width: 1200px; height: 630px; display: grid; grid-template-columns: 1fr 440px; gap: 48px; align-items: center;
    padding: 0 72px; background: ${t.body}; color: ${t.text}; font-family: ${t.font}; }
  .og * { box-sizing: border-box; }
  .lead { display: flex; flex-direction: column; gap: 22px; }
  .eyebrow { font-size: 24px; color: ${t.sub}; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand img { width: 84px; height: 84px; }
  .brand h1 { margin: 0; font-family: ${t.display}; font-weight: 400; font-size: 112px; line-height: 1; }
  .lead p { margin: 0; font-size: 28px; line-height: 1.55; color: ${t.sub}; }
  .url { font-family: ${t.code}; font-size: 20px; color: ${t.accent}; }
  .card { background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 10px; overflow: hidden; font-family: ${t.code}; }
  .req { padding: 14px 20px; border-bottom: 1px solid ${t.border}; font-size: 18px; color: ${t.sub}; }
  .st { padding: 18px 20px 8px; font-size: 34px; font-weight: 600; color: ${t.success}; }
  .st span { font-size: 20px; margin-left: 12px; }
  .rows { padding: 10px 20px 22px; display: flex; flex-direction: column; gap: 14px; }
  .row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px; font-size: 17px; color: ${t.sub}; }
  .bar { height: 14px; border-radius: 2px; background: ${t.accent}; }
  .bar.done { background: ${t.success}; }
</style>
<div class="og">
  <div class="lead">
    <div class="eyebrow">API と HTTP の基礎 · 問題を解いて学ぶ</div>
    <div class="brand"><img src="${BASE}favicon.svg" alt=""><h1>gantlo</h1></div>
    <p>HTTP・DNS・TLS・REST・OAuth を、<br>curl と HTTP の問題で学ぶ。<br>計画はガントチャートで。</p>
    <div class="url">maco165.github.io/gantlo</div>
  </div>
  <div class="card">
    <div class="req">GET /me/lessons</div>
    <div class="st">206<span>Partial Content</span></div>
    <div class="rows">
      <div class="row">HTTP と URI<div class="bar done" style="width:38%"></div></div>
      <div class="row">DNS と TLS<div class="bar" style="width:30%;margin-left:38%"></div></div>
      <div class="row">REST と OpenAPI<div class="bar" style="width:22%;margin-left:68%"></div></div>
      <div class="row">OAuth と JWT<div class="bar" style="width:10%;margin-left:90%"></div></div>
    </div>
  </div>
</div>`;
}

/** 見本の進捗: 本編の 2 レッスン完了、今日 21 XP、3 日連続、今日の復習が 2 問。計画は昨日から本編 → Spring Boot → 技術の歴史 */
function seedProgress() {
  const d = new Date();
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const today = key(d);
  const ago = (n) => key(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
  // カレンダーの見本: この 4 か月ほどの、日ごとに答えた問題の数 (ばらつきを持たせる)
  const answered = Array.from({ length: 120 }, (_, i) => [ago(i), [0, 4, 0, 12, 7, 0, 25, 3, 0, 40, 9, 0, 0, 18][i % 14]]).filter(([, n]) => n > 0);
  const progress = {
    v: 1,
    plan: { courses: ['main', 'spring', 'tech-history'], start: ago(1) },
    streak: { count: 3, lastDay: today },
    // 学んだ日: 直近 4 日と、カレンダーの見本の日 (5 日より前は答えた数の 3 倍の XP)
    xp: { total: 60, byDay: { ...Object.fromEntries(answered.filter(([day]) => day < ago(4)).map(([day, n]) => [day, n * 3])), [ago(4)]: 12, [ago(2)]: 9, [ago(1)]: 18, [today]: 21 } },
    answered: Object.fromEntries(answered),
    freeze: { count: 1, toward: 3, used: [ago(3)] },
    profile: { dailyGoalXp: 30, weeklyGoalDays: 4 },
    lessons: {
      'main-w1-l1': { done: true, best: 0.86, at: d.toISOString() },
      'main-w1-l2': { done: true, best: 1, at: d.toISOString() },
    },
    answers: {
      'main-w1-l1-q1': { right: 0, wrong: 1, last: ago(1), stage: 0, nextReview: today },
      'main-w1-l2-q2': { right: 1, wrong: 1, last: ago(1), stage: 0, nextReview: today },
      'main-w1-l1-q2': { right: 1, wrong: 0, last: ago(1) },
    },
  };
  localStorage.setItem('gantlo.v1', JSON.stringify(progress));
}

let serverExited = false;
async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (serverExited) throw new Error(`vite preview が ${PORT} 番で立ちませんでした (README_IMAGES_PORT に空いている番号を渡す)`);
    try {
      const res = await fetch(BASE);
      // 残っている別のサーバー (古い build) ではなく、いま組み立てた dist を配っていることを確かめる
      if (res.ok) {
        if ((await res.text()) === readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')) return;
        throw new Error(`${BASE} が今の dist と違う中身を返します (古い vite preview が残っていないか確かめる)`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('違う中身')) throw e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview が ${BASE} で応えません`);
}

// npx の子の vite まで止められるよう、別のプロセスグループで立てる
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
server.on('exit', () => (serverExited = true));
const browser = await chromium.launch();
try {
  await waitForServer();

  // 帯: サイトを開いて Gothic のトークンと字体を読み、同じページの中に帯を描いて撮る (字体の読み込みもサイトと同じ)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 360 }, deviceScaleFactor: 2 });
    await page.goto(BASE);
    await page.locator('.net__row').first().waitFor();
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('astryx-app-shell-main'));
      const v = (n) => cs.getPropertyValue(n).trim();
      return {
        body: v('--color-background-body'),
        surface: v('--color-background-surface'),
        text: v('--color-text-primary'),
        sub: v('--color-text-secondary'),
        border: v('--color-border'),
        accent: v('--color-accent'),
        success: v('--color-success'),
        font: cs.fontFamily,
        display: v('--font-family-display'),
        code: v('--font-family-code'),
      };
    });
    const missing = Object.entries(t).filter(([, x]) => !x).map(([k]) => k);
    if (missing.length) throw new Error(`テーマのトークンを読めませんでした: ${missing.join(', ')}`);
    await page.evaluate((html) => {
      document.body.innerHTML = html;
      document.body.style.margin = '0';
    }, bannerHtml(t));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.locator('.banner').screenshot({ path: `${OUT}banner.png` });
    await page.close();

    // 共有用の画像は SNS が縮めて出すので、等倍の 1200×630 で撮る (og:image:width・height と同じ大きさ)
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await og.goto(BASE);
    await og.locator('.net__row').first().waitFor();
    await og.evaluate((html) => {
      document.body.innerHTML = html;
      document.body.style.margin = '0';
    }, ogHtml(t));
    await og.evaluate(() => document.fonts.ready);
    await og.waitForTimeout(300);
    await og.locator('.og').screenshot({ path: OG });
    await og.close();
  }

  // iOS のホーム画面の画像。地は favicon.svg の地と同じ色 (index.html の theme-color) で、四隅まで塗る
  {
    const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await icon.setContent(touchIconHtml(readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')));
    await icon.locator('.icon').screenshot({ path: TOUCH_ICON, omitBackground: false });
    await icon.close();
  }

  const shoot = async (name, { width, height }, path, act) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await context.addInitScript(seedProgress);
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
    if (act) await act(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${name}.png` });
    await context.close();
  };
  const phone = { width: 390, height: 844 };
  await shoot('home-pc', { width: 1280, height: 800 }, '');
  await shoot('home-phone', phone, '');
  await shoot('plan-phone', phone, 'plan/', async (page) => {
    await page.locator('.gantt__row').first().waitFor();
    // 予定の帯と巻き・遅れが見えるよう、ガントチャートの見出しを上の帯のすぐ下に合わせる
    await page.locator('section.gantt').evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      document.getElementById('astryx-app-shell-main')?.scrollBy(0, -(document.querySelector('.mobile-bar')?.getBoundingClientRect().height ?? 0) - 16);
    });
  });
  await shoot('fill-phone', phone, `lesson/${FILL_LESSON.id}/`, async (page) => {
    // ありそうな誤り (-d) を入れて 400 を出す
    await page.locator('[data-testid="fill-code"] input').first().fill('-d');
    await page.getByRole('button', { name: 'POST 答えを送る' }).click();
    await page.locator('section.response[data-status]').first().scrollIntoViewIfNeeded();
  });
  await shoot('order-phone', phone, `lesson/${ORDER_LESSON.id}/`, async (page) => {
    await answer(page, ORDER_LESSON.questions[0], 'right');
    // 帯の階段が見えるよう、並びの先頭を上に合わせる
    // (上の帯が上に貼り付くので、その高さと少しの余白の分だけ戻す)
    await page.locator('[data-testid="order-rows"]').evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      document.getElementById('astryx-app-shell-main')?.scrollBy(0, -(document.querySelector('.mobile-bar')?.getBoundingClientRect().height ?? 0) - 120);
    });
  });
  // コースの画面: 見本の進捗 (本編の 2 レッスン完了) で 206 と次のレッスン・Network の表
  await shoot('course-phone', phone, 'course/main/', (page) => page.locator('.net__row').first().waitFor());
  await shoot('review-phone', phone, 'review/');
  await shoot('progress-phone', phone, 'progress/', (page) => page.locator('.prog__table tbody tr').first().waitFor());
  // 学び続ける仕組み: 休みの札と週の目標の行から、26 週のマス・14 日の復習まで
  await shoot('habits-phone', phone, 'progress/', async (page) => {
    await page.locator('[data-testid="habits"]').evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      document.getElementById('astryx-app-shell-main')?.scrollBy(0, -(document.querySelector('.mobile-bar')?.getBoundingClientRect().height ?? 0) - 16);
    });
  });
  await shoot('glossary-phone', phone, 'glossary/', (page) => page.locator('article.gloss').first().waitFor());
  await shoot('about-phone', phone, 'about/');
  await shoot('menu-phone', phone, '', async (page) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.waitForTimeout(500);
  });
  console.log(`書き出した: ${OUT}`);
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
