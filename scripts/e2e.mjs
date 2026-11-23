#!/usr/bin/env node
// ブラウザでの通しの検査。npm run e2e で、組み立てた dist を vite preview で配り、Playwright の Chromium で操作する。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで、空の localStorage から問題データの中のレッスンを解いて次を確かめる。
// 解くレッスンと、何問目が何の種類かは scripts/e2e-lessons.mjs でデータから探し、期待の正答数と XP もデータから数える:
//   1. 答える前の AI に聞くリンクに問題文が入り、正解と解説が入っていない
//   2. 不正解で 400 Bad Request・正しい答え (X-Expected)・Retry-After・解説・出典が出る
//   3. 正解で 200 OK・X-XP・解説・出典が出る
//   4. 並べ替えは、上下のボタンとキーボード (Tab と Enter) だけで正解にでき (200 OK・帯が階段)、動かしたあとも手元 (focus) が
//      動かした行のボタンに残る。順が違えば 409 Conflict と「N 行が違う位置です」、違う位置の行は誤りの色。実習は全部の手順に印を付けると終えられる
//   5. 最後の問題のあと、201 Created・正答数・結果の JSON・Location が出て、進捗 (gantlo.v1) に残る
//   6. 「もう一度解く」で 1 問目に戻り、4 択の並びが混ぜ直される。メディアタイプを誤ると 415
//   7. 知らないレッスンの id は 404。左のメニュー (スマホでは左から開く引き出し) はそのまま
//   8. どの画面も横にはみ出さない。サイトの外へは何も送らない。ページのエラーが無い
//   9. 答える前の AI のリンクは、どの種類の問題でも答えの手がかりを含まない
//  10. 途中で本文へ飛ぶリンク (skip link) を押しても、何問目かが変わらない
//  11. 390 幅では、主な操作 (閉じる・答えを送る・次へ・AI に聞く・空欄・4 択の行・並べ替えの上下のボタン) の押せる範囲が 44px 以上
//  12. どの画面でも、文が「…」で切られていない (問題文・選択肢・手順・解説・結果の一覧)
//  13. 390 幅で、# だけが変わる戻るでもスマホのメニューが閉じ、レッスンは何問目かが変わらない
// ホームと計画の画面 (R-6・R-17・R-18) は scripts/e2e-home-plan.mjs が確かめる。
// おおよその予定と巻き・遅れ (R-20) は scripts/e2e-schedule.mjs が確かめる。
// 復習と設定の画面 (R-13) は scripts/e2e-review-settings.mjs が確かめる。
// 進捗の画面と用語集 (R-14) は scripts/e2e-progress-glossary.mjs が確かめる。
// メニューの下端の「このサイト」の 2 つ・上の帯の GitHub のボタン・このサイトについての画面 (B-023) は scripts/e2e-about.mjs が確かめる。
// コースの画面 (B-024) は scripts/e2e-course.mjs が確かめる。
// 模擬試験の画面 (B-027) は scripts/e2e-exam.mjs が確かめる。
// 休みの札・週の目標・.ics・カレンダー・到達・まとめのカード (#55) は scripts/e2e-habits.mjs が確かめる。
// ページごとの共有の画像と、結果の共有のボタン (#55) は scripts/e2e-share.mjs が確かめる。
// 試す画面 (#55) は scripts/e2e-try.mjs が確かめる (外のサービスへの要求は page.route で差し替える)。
// 390 幅の崩れ (出典の外部リンクの印・用語集の区切り。B-025) は scripts/e2e-narrow.mjs が確かめる。
// テーマが Gothic であることと、文字と地のコントラスト (4.5:1 以上) は scripts/e2e-contrast.mjs が確かめる。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runAbout } from './e2e-about.mjs';
import { runContrast } from './e2e-contrast.mjs';
import { runCourse } from './e2e-course.mjs';
import { runExam } from './e2e-exam.mjs';
import { runHabits } from './e2e-habits.mjs';
import { runHomeAndPlan } from './e2e-home-plan.mjs';
import {
  XP_PER_CORRECT,
  XP_PER_LAB,
  answer,
  arrangeOrder,
  choiceRadio,
  coverLessons,
  expectedOutcome,
  expectedScore,
  fill,
  hasKind,
  hasMediaBlank,
  isPlainFill,
  loadLessons,
  orderIds,
  orderText,
  pickWalkLesson,
  rightInputs,
  startLesson,
  unsortedTarget,
} from './e2e-lessons.mjs';
import { checkIntroGate, runIntro } from './e2e-intro.mjs';
import { runNarrow } from './e2e-narrow.mjs';
import { runProgressAndGlossary } from './e2e-progress-glossary.mjs';
import { runReviewAndSettings } from './e2e-review-settings.mjs';
import { runSchedule } from './e2e-schedule.mjs';
import { runShare } from './e2e-share.mjs';
import { runTry } from './e2e-try.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT ?? 4328);
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/gantlo/`;
// 解くレッスンと、何問目が何の種類かは問題データから探す (データの中身を決め打ちしない)
const LESSONS = loadLessons();
/** 通しで解くレッスン (並べ替え・4 択・メディアタイプの無い穴埋めを持つ) */
const lesson = pickWalkLesson(LESSONS);
const LESSON_URL = `${BASE}lesson/${lesson.id}/`;
/** 不正解の 400 を確かめる問題 (最初のメディアタイプの無い穴埋め) と、並べ替え・4 択の最初の問題 */
const qWrong = lesson.questions.find(isPlainFill);
const qOrder = lesson.questions.find((q) => q.kind === 'order');
const qChoice = lesson.questions.find((q) => q.kind === 'choice');
/**
 * 通しのレッスンに無いものを持つレッスン (メディアタイプの空欄・大文字と小文字を区別しない空欄・実習)。
 * 1 周目は全部正しく答え (空欄は大文字と小文字を変えて入れる)、2 周目でメディアタイプを誤る
 */
const caseBlank = (l) => l.questions.some((q) => (q.kind === 'command' || q.kind === 'http') && q.blanks.some((b) => b.match === 'header-name' || b.match === 'media-type'));
const extraLessons = coverLessons(LESSONS, {
  ...(lesson.questions.some(hasMediaBlank) ? {} : { メディアタイプの空欄: (l) => l.questions.some(hasMediaBlank) }),
  ...(caseBlank(lesson) ? {} : { 大文字と小文字を区別しない空欄: caseBlank }),
  ...(hasKind(lesson, 'lab') ? {} : { 実習: (l) => hasKind(l, 'lab') }),
});

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
  if (!cond) failures++;
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (serverExited) throw new Error(`vite preview が ${PORT} 番で立ちませんでした (番号が埋まっていないか確かめる)`);
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

async function noHorizontalOverflow(page, width, label) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= width, `${label}: 横にはみ出さない (scrollWidth ${sw} <= ${width})`);
  await noTruncatedText(page, label);
}

/**
 * 選択肢や手順の文が、長くても折り返せる作りか (1 行に切る nowrap と … を持たない)。
 * 見本の文が短くて今は切れていなくても、長い文で切れる作りを見つける
 */
async function wrapsText(page, selector, label) {
  const single = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} *`)]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return el.textContent.trim() !== '' && cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis';
        })
        .map((el) => el.textContent.trim().slice(0, 20)),
    selector,
  );
  check(single.length === 0, `${label}: 長い文も折り返せる (1 行に切る作りでない) ${single.join(' / ')}`);
}

/** 本文の中で、文が 1 行や数行に切られて「…」になっている所 (scrollWidth > clientWidth など) が無いか */
async function noTruncatedText(page, label) {
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('#astryx-app-shell-main *')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (el.offsetParent === null || el.textContent.trim() === '') return false;
        const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
        const clamped = cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '' && el.scrollHeight > el.clientHeight + 1;
        return ellipsis || clamped;
      })
      .map((el) => `${el.textContent.trim().slice(0, 20)} (${el.scrollWidth}>${el.clientWidth})`),
  );
  check(cut.length === 0, `${label}: 文が切れていない ${cut.join(' / ')}`);
}

/** 画面に並んだ選択肢の文 (A. から D. の行) を上から順に読む */
const choiceOrder = async (page) => {
  const text = await page.locator('.lesson__main').innerText();
  return text.split('\n').map((t) => t.trim()).filter((t) => /^[A-D]\. /.test(t));
};

/** 応答の枠 (data-status) を待って返す */
async function response(page, code) {
  const r = page.locator(`section.response[data-status="${code}"]`);
  await r.waitFor();
  return r;
}

/** 出典が X-Source として全部リンクで出ているか */
async function sourcesShown(r, sources) {
  const hrefs = await r.locator('a[href^="https://"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  return sources.every((s) => hrefs.includes(s));
}

/** AI に聞くリンクの q= を読む */
async function aiQuery(page) {
  const claude = await page.getByRole('link', { name: 'Claude' }).first().getAttribute('href');
  const chatgpt = await page.getByRole('link', { name: 'ChatGPT' }).first().getAttribute('href');
  return { claude, chatgpt, text: new URL(claude).searchParams.get('q') ?? '' };
}

/** 答えの手がかりになる文 (正解・解説・実行結果の例・見えること・誤りの理由) */
function secretsOf(q) {
  const out = [q.explanation];
  if (q.kind === 'command' || q.kind === 'http') for (const b of q.blanks) out.push(...b.answers, ...(b.wrong ?? []).map((w) => w.why));
  if (q.kind === 'command' && q.output) out.push(q.output);
  if (q.kind === 'choice') {
    // 正解の選択肢の文は選択肢として必ず出るので、「正解は「…」」の形で入っていないかを見る
    const right = q.choices.find((c) => c.id === q.answer).text;
    out.push(`${right}」`);
    for (const c of q.choices) if (c.why) out.push(c.why);
  }
  if (q.kind === 'lab') out.push(q.expected);
  // 並べ替えの項目の文は必ず出るので、正しい順に並んだ形で入っていないかを見る
  if (q.kind === 'order') out.push(q.answer.map((id) => `- ${q.items.find((it) => it.id === id).text}`).join('\n'));
  return out;
}

/** 答える前の AI のリンクの文に、問題文が入り、答えの手がかりと「正解」の字が入っていないか */
async function checkNoLeak(page, q, label) {
  const { text } = await aiQuery(page);
  // 問題文やコードにもともと書いてある文字 (URL の一部を答えさせる問題など) は、リンクに入っていても手がかりではない
  const shown = [q.prompt, typeof q.code === 'string' ? q.code : (q.code?.text ?? '')];
  const leaked = secretsOf(q).filter((x) => text.includes(x) && !shown.some((s) => s.includes(x)));
  if (text.includes('正解')) leaked.push('「正解」の字');
  check(text.includes(q.prompt) && leaked.length === 0, `${label} (${q.kind}): 答える前の AI のリンクは問題文だけで、正解・解説・見えることを含まない ${leaked.join(' / ')}`);
}

/** 押せる範囲の大きさ (390 幅の主な操作は 44px 以上) */
const MIN_TARGET = 44;
async function checkTarget(locator, label, { width = false } = {}) {
  const box = await locator.boundingBox();
  const ok = box !== null && box.height >= MIN_TARGET && (!width || box.width >= MIN_TARGET);
  check(ok, `${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '見えない'})`);
}

// 名前は aria-label (上下のボタン) か、無ければボタンの文字 (答えを送るボタン)
const focusedLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');

/** マウスを使わず、Tab だけで手元 (focus) を label のボタンまで運ぶ */
async function tabTo(page, label) {
  for (let i = 0; i < 80; i++) {
    if ((await focusedLabel(page)) === label) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

/** 手元のボタンを Enter で押し、並びが変わるまで待つ */
async function pressEnter(page) {
  const before = (await orderIds(page)).join(',');
  await page.keyboard.press('Enter');
  await page.waitForFunction((b) => [...document.querySelectorAll('[data-testid="order-rows"] > li')].map((l) => l.dataset.item).join(',') !== b, before, { timeout: 2000 }).catch(() => {});
}

/** 並べ替えを確かめたあと、行ごとの帯の左端 (%) と、誤りの色の行か */
const orderBars = (page) =>
  page.locator('[data-testid="order-rows"] > li').evaluateAll((ls) =>
    ls.map((l) => {
      const bar = l.querySelector('.order__bar');
      return { id: l.dataset.item, ok: l.dataset.ok === 'true', mark: l.querySelector('.order__mark')?.textContent ?? '', left: parseFloat(bar?.style.left ?? 'NaN'), color: bar ? getComputedStyle(bar).backgroundColor : '', wrongClass: l.classList.contains('order__row--wrong') };
    }),
  );
/** テーマのトークンの色を、計算済みの rgb で読む */
const tokenColor = (page, token) =>
  page.evaluate((t) => {
    const el = document.createElement('span');
    el.style.backgroundColor = `var(${t})`;
    document.body.append(el);
    const c = getComputedStyle(el).backgroundColor;
    el.remove();
    return c;
  }, token);

const send = (page) => page.getByRole('button', { name: 'POST 答えを送る' }).click();
const next = (page) => page.getByRole('button', { name: /^(次の問題へ|POST 結果を記録する)$/ }).click();

/** 完了の応答 (201) の本文の JSON を読む。CodeBlock の題と言語の札も pre の文字に入るので、最初の { から最後の } までを読む */
async function resultJson(r) {
  const raw = (await r.locator('pre').first().textContent()) ?? '';
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    return { body, parsed: JSON.parse(body) };
  } catch {
    return { body, parsed: null };
  }
}

/**
 * 開いているレッスンを 1 問目から最後まで解き、完了 (201) の応答を返す。
 * modeOf(q) が答え方 (e2e-lessons.mjs の answer の mode)。before(q, i) は答える前の検査で、true を返せば自分で答えたものとする。
 * after(q, i, mode, r) は応答の枠 (r) が出たあとの検査
 */
async function walk(page, l, modeOf, { before = async () => false, after = async () => {} } = {}) {
  const outcomes = [];
  const codes = [];
  for (const [i, q] of l.questions.entries()) {
    await page.getByRole('heading', { name: q.prompt }).waitFor();
    const mode = modeOf(q);
    if (!(await before(q, i, mode))) await answer(page, q, mode);
    const want = expectedOutcome(q, mode);
    const r = await response(page, want.code);
    outcomes.push(want.outcome);
    codes.push(String(want.code));
    await after(q, i, mode, r);
    await next(page);
  }
  return { r: await response(page, 201), outcomes, codes };
}

async function run(browser, name, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  // 4 択の並びを毎回同じにするため、決まった種から乱数を作る (開くたび・やり直すたびに違う並びになることは確かめる)
  await context.addInitScript(() => {
    let s = 20261119;
    Math.random = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // サイトの外へは何も取りに行かない (書体も自前で配る。src/fonts.css)
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === ORIGIN || url.protocol === 'data:') return;
    outside.push(`${req.method()} ${req.url()}`);
  });
  const tag = `[${name}]`;
  const phone = width < 768;
  const n = lesson.questions.length;
  // 種類ごとの検査は、最初に出会った 1 回だけ深く行う。最後に、どれも 1 回は行ったことを確かめる (データが変わって黙って抜けないように)
  const seen = new Set();
  const once = (key) => !seen.has(key) && Boolean(seen.add(key));

  // 1 問目: ページの題・何問目か・AI に聞くリンク・押せる範囲
  const q0 = lesson.questions[0];
  await page.goto(LESSON_URL);
  await checkIntroGate(page, lesson, tag, width, { check, noHorizontalOverflow });
  await page.getByRole('heading', { name: q0.prompt }).waitFor();
  check((await page.title()).startsWith(lesson.title), `${tag} ページの題がレッスン名で始まる (${lesson.id})`);
  check(await page.getByText(`1 / ${n} 問`).first().isVisible(), `${tag} 何問目かが出る`);
  const aiBefore = await aiQuery(page);
  check(aiBefore.claude.startsWith('https://claude.ai/new?q=') && aiBefore.chatgpt.startsWith('https://chatgpt.com/?q='), `${tag} AI に聞くリンクは claude.ai/new?q= と chatgpt.com/?q=`);
  check((await page.getByRole('link', { name: 'Claude' }).first().getAttribute('target')) === '_blank', `${tag} AI に聞くリンクは別のタブで開く`);
  if (phone) {
    await checkTarget(page.getByRole('link', { name: 'レッスンを閉じる' }), `${tag} 閉じるボタン`, { width: true });
    await checkTarget(page.getByRole('link', { name: 'Claude' }), `${tag} AI に聞くリンク (Claude)`, { width: true });
    await checkTarget(page.getByRole('link', { name: 'ChatGPT' }), `${tag} AI に聞くリンク (ChatGPT)`, { width: true });
  }

  // 1 周目: 最初のメディアタイプの無い穴埋めだけを誤り (400)、ほかは正しく答える
  let choiceOrder1 = [];
  const pass1 = await walk(page, lesson, (q) => (q === qWrong ? 'wrong' : 'right'), {
    before: async (q, i) => {
      // どの問題でも、答える前の AI のリンクは問題文だけ
      await checkNoLeak(page, q, `${tag} ${i + 1} 問目`);
      if (i === 1) {
        // 途中で本文へ飛ぶリンク (AppShell の skip link) を押しても、レッスンは 1 問目に戻らない
        const skip = page.locator('[data-testid="skip-to-content"]');
        check((await skip.count()) === 1, `${tag} 本文へ飛ぶリンクがある`);
        await skip.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        check(
          (await page.getByText(`2 / ${n} 問`).first().isVisible()) && (await page.getByRole('heading', { name: q.prompt }).isVisible()) && new URL(page.url()).pathname === new URL(LESSON_URL).pathname,
          `${tag} 途中で本文へ飛ぶリンクを押しても何問目かが変わらない`,
        );
        if (phone) {
          // # が付いた状態でメニューを開き、戻る (# だけが外れる) と、メニューは閉じ、レッスンはそのまま
          const menuOpen = () => page.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open));
          await page.getByRole('button', { name: 'メニューを開く' }).click();
          await page.waitForFunction(() => [...document.querySelectorAll('dialog')].some((d) => d.open));
          check(new URL(page.url()).hash !== '' && (await menuOpen()), `${tag} # が付いた状態でメニューが開く`);
          await page.goBack();
          await page.waitForTimeout(600);
          check(!(await menuOpen()) && new URL(page.url()).hash === '' && (await page.getByText(`2 / ${n} 問`).first().isVisible()), `${tag} # だけが変わる戻るでもメニューが閉じ、何問目かは変わらない`);
        }
      }
      if ((q.kind === 'command' || q.kind === 'http') && once('fill-ui')) {
        await noHorizontalOverflow(page, width, `${tag} 問題 (穴埋め)`);
        if (phone) {
          await checkTarget(page.getByRole('button', { name: 'POST 答えを送る' }), `${tag} 答えを送るボタン`);
          // 390 幅でも styles.css のレッスンの画面の決まりが効いている (括弧の崩れで @media の中に入ると、穴埋めの枠が消える)
          const frame = await page.locator('[data-testid="fill-code"]').evaluate((el) => {
            const cs = getComputedStyle(el);
            return `${cs.borderTopWidth} ${cs.borderTopStyle}`;
          });
          check(frame === '1px solid', `${tag} 390 幅でもレッスンの画面の決まりが効いている (穴埋めの枠 ${frame})`);
          const field = page.locator('[data-testid="fill-code"] .astryx-text-input').first();
          await checkTarget(field, `${tag} 空欄の入力`);
          // 入力欄の枠の端を押しても、文字を打てる状態になる
          const fb = await field.boundingBox();
          await page.mouse.click(fb.x + fb.width - 3, fb.y + 3);
          check(await page.evaluate(() => document.activeElement?.closest('[data-testid="fill-code"]') !== null && document.activeElement?.tagName === 'INPUT'), `${tag} 空欄の枠の端を押しても入力できる`);
        }
      }
      if (q === qOrder) return await solveOrderByKeyboard(page, q, tag, width, phone);
      if (q === qChoice) {
        choiceOrder1 = await choiceOrder(page);
        const dataOrder = q.choices.map((c, k) => `${String.fromCharCode(65 + k)}. ${c.text}`);
        check(choiceOrder1.length === 4 && choiceOrder1.join('|') !== dataOrder.join('|'), `${tag} 4 択の選択肢は開いたときに混ぜてある (${choiceOrder1.map((t) => t.slice(3, 6)).join(',')})`);
        await noHorizontalOverflow(page, width, `${tag} 問題 (4 択)`);
        await wrapsText(page, '.astryx-radio-list', `${tag} 4 択の選択肢`);
        if (phone) {
          const rows = page.locator('.astryx-radio-list-item');
          for (let k = 0; k < (await rows.count()); k++) await checkTarget(rows.nth(k), `${tag} 4 択の行 ${k + 1}`);
          // 行の右端を押しても、その選択肢が選ばれる
          const rb = await rows.nth(2).boundingBox();
          await page.mouse.click(rb.x + rb.width - 4, rb.y + 3);
          check(await page.getByRole('radio').nth(2).isChecked(), `${tag} 4 択の行の端を押しても選べる`);
        }
      }
      if (q.kind === 'lab' && once('lab-ui')) return await finishLabChecked(page, q, tag, width, phone);
      return false;
    },
    after: async (q, i, mode, r) => {
      if (q === qWrong) {
        seen.add('400');
        check(await r.getByText('Bad Request').isVisible(), `${tag} 不正解は 400 Bad Request`);
        check(await r.getByText(/^不正解です/).isVisible(), `${tag} 400 に日本語の説明が付く`);
        const expected = q.blanks.map((b) => b.answers[0]).join(' / ');
        check(await r.getByText(expected, { exact: true }).isVisible(), `${tag} 不正解のとき X-Expected に正しい答え (${expected}) が出る`);
        check(await r.getByText('86400', { exact: true }).isVisible(), `${tag} 不正解のとき Retry-After: 86400 が出る`);
        check(await r.getByText(q.explanation).isVisible(), `${tag} 不正解のとき解説が出る`);
        check(await sourcesShown(r, q.sources), `${tag} 不正解のとき出典 (X-Source) がリンクで出る`);
        const after = await aiQuery(page);
        check(after.text.includes('不正解') && q.blanks.every((b) => after.text.includes(b.answers[0])), `${tag} 答えたあとの AI のリンクには自分の答えと正解が入る`);
        // 誤りを報告: GitHub の新しい Issue。題と本文に問題の id・レッスン・ページの URL が入り、自分の答えは入らない
        const report = page.getByRole('link', { name: /誤りを報告/ });
        check((await report.count()) === 1, `${tag} 答えたあとに「誤りを報告」のリンクが 1 つある`);
        const reportUrl = new URL(await report.getAttribute('href'));
        const reportText = `${reportUrl.searchParams.get('title')}\n${reportUrl.searchParams.get('body')}`;
        check(
          reportUrl.origin + reportUrl.pathname === 'https://github.com/maco165/gantlo/issues/new' &&
            reportText.includes(q.id) &&
            reportText.includes(lesson.title) &&
            reportText.includes(`https://maco165.github.io/gantlo/lesson/${lesson.id}/`),
          `${tag} 誤りを報告は GitHub の新しい Issue で、題と本文に問題の id・レッスン・ページの URL が入る`,
        );
        check(!reportText.includes('zz-wrong-answer') && (await report.getAttribute('target')) === '_blank', `${tag} 誤りを報告には自分の答えを入れず、別のタブで開く`);
        if (phone) await checkTarget(report, `${tag} 誤りを報告のリンク`);
        await noHorizontalOverflow(page, width, `${tag} 応答 400`);
        if (phone && i < n - 1) await checkTarget(page.getByRole('button', { name: '次の問題へ' }), `${tag} 次へのボタン`);
      } else if ((q.kind === 'command' || q.kind === 'http') && once('fill-200')) {
        check(await r.getByText('OK', { exact: true }).isVisible(), `${tag} 正解は 200 OK`);
        check(await r.getByText('正解です').isVisible(), `${tag} 200 に日本語の説明が付く`);
        check(await r.getByText(`+${XP_PER_CORRECT}`, { exact: true }).isVisible(), `${tag} 正解のとき X-XP: +${XP_PER_CORRECT} が出る`);
        check(await r.getByText(q.explanation).isVisible(), `${tag} 正解のとき解説が出る`);
        check(await sourcesShown(r, q.sources), `${tag} 正解のとき出典 (X-Source) がリンクで出る`);
        await noHorizontalOverflow(page, width, `${tag} 応答 200`);
      } else if (q === qOrder) {
        check(await r.getByText('OK', { exact: true }).isVisible(), `${tag} 並べ替えの正解は 200 OK`);
        check(await r.getByText(`+${XP_PER_CORRECT}`, { exact: true }).isVisible(), `${tag} 並べ替えの正解で X-XP: +${XP_PER_CORRECT}`);
        check(await r.getByText(q.explanation).isVisible(), `${tag} 並べ替えの正解で解説が出る`);
        check(await sourcesShown(r, q.sources), `${tag} 並べ替えの正解で出典 (X-Source) が出る`);
        const stairs = await orderBars(page);
        check(
          stairs.length === q.items.length && stairs.every((b, k) => b.ok && !b.wrongClass && (k === 0 || b.left > stairs[k - 1].left)),
          `${tag} 正しい順なら、並べた順に帯が階段に描かれる (${stairs.map((b) => Math.round(b.left)).join(',')})`,
        );
        await noHorizontalOverflow(page, width, `${tag} 応答 (並べ替え 200)`);
      } else if (q === qChoice) {
        seen.add('choice-200');
        check(await r.getByText(q.explanation).isVisible(), `${tag} 4 択の正解で解説が出る`);
      }
    },
  });

  // 完了: 201 Created・正答数・JSON・Location。期待の値は答え方とデータから数える
  const want1 = expectedScore(lesson.questions, pass1.outcomes);
  let r = pass1.r;
  check(await r.getByText('Created', { exact: true }).isVisible(), `${tag} 完了は 201 Created`);
  check(await r.getByText(`${want1.total} 問のうち ${want1.correct} 問が正解`).isVisible(), `${tag} 201 の説明に正答数 (${want1.correct} / ${want1.total}) が出る (並べ替えを含む)`);
  check(await page.getByText(`${want1.correct} / ${want1.total}`, { exact: true }).isVisible(), `${tag} 完了画面に正答数 ${want1.correct} / ${want1.total} が出る`);
  check(await r.getByText(`/me/lessons/${lesson.id}`, { exact: true }).isVisible(), `${tag} Location: /me/lessons/<id> が出る`);
  {
    const { body, parsed } = await resultJson(r);
    check(JSON.stringify(parsed) === JSON.stringify({ lesson: lesson.id, ...want1 }), `${tag} 結果の JSON は lesson・correct・total・xp (${body.replace(/\s+/g, ' ')})`);
  }
  await noHorizontalOverflow(page, width, `${tag} 完了 201`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
  check(saved?.lessons?.[lesson.id]?.done === true && Math.abs(saved.lessons[lesson.id].best - want1.correct / want1.total) < 1e-9, `${tag} 進捗にレッスンの完了と最高の正答率 (${want1.correct}/${want1.total}) が残る`);
  check(saved?.xp?.total === want1.xp, `${tag} 進捗に XP (${want1.xp}) が残る (${saved?.xp?.total})`);
  check(
    lesson.questions.every((q, i) => q.kind === 'lab' || (pass1.outcomes[i] === 'wrong' ? saved?.answers?.[q.id]?.wrong === 1 : saved?.answers?.[q.id]?.right === 1)),
    `${tag} 進捗に問題ごとの正誤の回数が残る (並べ替えを含む)`,
  );

  // もう一度解く: 1 問目に戻る。並べ替えを並べ替えきらずに送ると 409。4 択は混ぜ直す
  await page.getByRole('button', { name: 'もう一度解く' }).click();
  await page.getByRole('heading', { name: q0.prompt }).waitFor();
  check(await page.getByText(`1 / ${n} 問`).first().isVisible(), `${tag} もう一度解くと 1 問目に戻る`);
  let mixedOrder = [];
  const pass2 = await walk(page, lesson, (q) => (q === qOrder ? 'unsorted' : 'right'), {
    before: async (q) => {
      if (q === qOrder) {
        const restartOrder = await orderIds(page);
        check(restartOrder.join(',') !== q.answer.join(','), `${tag} もう一度解いても並べ替えは正解と違う並びから始まる (${restartOrder.join(',')})`);
        // 正しい位置の行と違う位置の行を混ぜ、必ず正しい順と違う並びにする (unsortedTarget。ここは押すだけなのでマウスでよい)
        await arrangeOrder(page, q, unsortedTarget(restartOrder, q.answer));
        mixedOrder = await orderIds(page);
        await send(page);
        return true;
      }
      if (q === qChoice) {
        const order2 = await choiceOrder(page);
        check(order2.join('|') !== choiceOrder1.join('|'), `${tag} もう一度解くと 4 択の並びが混ぜ直される (${order2.map((t) => t.slice(3, 6)).join(',')})`);
      }
      return false;
    },
    after: async (q, i, mode, res) => {
      if (q !== qOrder) return;
      seen.add('409');
      const wrongRows = mixedOrder.filter((id, k) => q.answer[k] !== id).length;
      check(await res.getByText('Conflict', { exact: true }).isVisible(), `${tag} 順が違えば 409 Conflict`);
      check(await res.getByText(new RegExp(`^${wrongRows} 行が違う位置です`)).isVisible(), `${tag} 409 に「${wrongRows} 行が違う位置です」の説明が付く`);
      check(await res.getByText(q.answer.map((id) => orderText(q, id)).join(' → '), { exact: true }).isVisible(), `${tag} 409 のとき X-Expected に正しい順が出る`);
      check(await res.getByText('86400', { exact: true }).isVisible(), `${tag} 409 のとき Retry-After: 86400 が出る`);
      const errorColor = await tokenColor(page, '--color-text-error');
      const successColor = await tokenColor(page, '--color-text-success');
      const bars = await orderBars(page);
      check(bars.map((b) => b.id).join(',') === mixedOrder.join(','), `${tag} 帯は並べた順の行に描かれる`);
      check(wrongRows > 0 && wrongRows < mixedOrder.length, `${tag} 確かめる並びに正しい位置の行と違う位置の行が両方ある (${mixedOrder.join(',')})`);
      check(
        bars.every((b) => (b.ok ? !b.wrongClass && b.color === successColor : b.wrongClass && b.color === errorColor)) && bars.filter((b) => !b.ok).length === wrongRows,
        `${tag} 違う位置の行 (${wrongRows} 行) は誤りの色、正しい位置の行は成功の色 (${bars.map((b) => (b.ok ? 'o' : 'x')).join('')}; ${bars.map((b) => b.color).join(' / ')}; 誤り ${errorColor}・成功 ${successColor})`,
      );
      check(
        bars.every((b) => (b.ok ? b.mark.includes('正しい位置') : b.mark.includes(`正しくは ${q.answer.indexOf(b.id) + 1} 行目`))),
        `${tag} 違う位置の行に「正しくは <正しい順での位置> 行目」が出る (${bars.map((b) => b.mark).join(' / ')})`,
      );
      check(bars.every((b) => Math.abs(b.left - (q.answer.indexOf(b.id) / q.answer.length) * 100) < 0.01), `${tag} 帯はその項目の正しい順での位置に描かれる`);
      await noHorizontalOverflow(page, width, `${tag} 応答 (並べ替え 409)`);
      const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
      check(savedAfter?.answers?.[q.id]?.wrong === 1, `${tag} 並べ替えの誤りも正誤の回数に残る`);
    },
  });
  {
    // 完了画面の一覧のコードが答えの画面と同じ (並べ替えの誤り 409 など)
    const listCodes = await page.locator('.result__code').allInnerTexts();
    check(listCodes.join(',') === pass2.codes.join(','), `${tag} 完了画面の一覧は答えの画面と同じコード (${listCodes.join(',')} = ${pass2.codes.join(',')})`);
    await noHorizontalOverflow(page, width, `${tag} 完了 201 (2 周目)`);
  }

  // ほかのレッスン: 1 周目は全部正しく (大文字と小文字を変えた空欄・実習)、2 周目でメディアタイプを誤る (415)
  for (const extra of extraLessons) {
    await page.goto(`${BASE}lesson/${extra.id}/`);
    await startLesson(page);
    const e1 = await walk(page, extra, () => 'right', {
      before: async (q) => (q.kind === 'lab' && once('lab-ui') ? await finishLabChecked(page, q, tag, width, phone) : false),
      after: async (q) => {
        const caseInsensitive = (q.kind === 'command' || q.kind === 'http') && rightInputs(q).some((v, k) => v !== q.blanks[k].answers[0]);
        if (caseInsensitive) seen.add('case');
      },
    });
    const wantE = expectedScore(extra.questions, e1.outcomes);
    const { parsed } = await resultJson(e1.r);
    check(JSON.stringify(parsed) === JSON.stringify({ lesson: extra.id, ...wantE }), `${tag} ${extra.id} を全部正しく答えると、結果の JSON が全問正解 (${JSON.stringify(parsed)})`);
    if (!extra.questions.some(hasMediaBlank)) continue;
    await page.getByRole('button', { name: 'もう一度解く' }).click();
    let mediaDone = false;
    const e2 = await walk(page, extra, (q) => (hasMediaBlank(q) && !mediaDone ? ((mediaDone = true), 'media') : 'right'), {
      after: async (q, i, mode, res) => {
        if (mode !== 'media') return;
        seen.add('415');
        check(await res.getByText('Unsupported Media Type').isVisible(), `${tag} メディアタイプの空欄を誤ると 415 Unsupported Media Type`);
        check(await res.getByText(/^メディアタイプが違います/).isVisible(), `${tag} 415 に日本語の説明が付く`);
      },
    });
    const listCodes = await page.locator('.result__code').allInnerTexts();
    check(listCodes.join(',') === e2.codes.join(','), `${tag} 完了画面の一覧は答えの画面と同じコード (メディアタイプの誤り 415 を含む) (${listCodes.join(',')} = ${e2.codes.join(',')})`);
  }
  check(seen.has('case'), `${tag} ヘッダー名とメディアタイプは、大文字と小文字を変えて入れても正解になる`);
  const must = ['fill-ui', 'fill-200', '400', 'choice-200', '409', 'lab-ui', 'case', '415'];
  check(
    must.every((k) => seen.has(k)),
    `${tag} 種類ごとの検査を全部行った (無いもの: ${must.filter((k) => !seen.has(k)).join(',') || 'なし'}; ${[lesson.id, ...extraLessons.map((l) => l.id)].join(',')})`,
  );

  // 知らないレッスンは 404。左のメニューはそのまま
  await page.goto(`${BASE}lesson/no-such-lesson/`);
  await page.getByText('Not Found', { exact: true }).waitFor();
  check(await page.getByText('404', { exact: true }).isVisible(), `${tag} 知らないレッスンの id は 404`);
  await noHorizontalOverflow(page, width, `${tag} 404`);
  if (width >= 768) {
    check(await page.getByRole('link', { name: '学習' }).first().isVisible(), `${tag} 左のメニューが出ている`);
  } else {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    const item = page.getByRole('link', { name: '学習' }).last();
    await item.waitFor();
    // 引き出しが動き終わるまで待ってから位置を測る
    await page.waitForFunction(() => {
      const links = [...document.querySelectorAll('a')].filter((a) => a.textContent?.trim() === '学習');
      const rect = links.at(-1)?.getBoundingClientRect();
      return rect !== undefined && rect.x >= 0;
    });
    const box = await item.boundingBox();
    check(box !== null && box.x >= 0 && box.x < width / 2, `${tag} スマホのメニューは左から開く (x=${box?.x})`);
  }

  check(outside.length === 0, `${tag} サイトの外へは何も送らない (字の GET のほかに外への要求が無い) ${outside.join(' ')}`);
  check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
  await context.close();
}

/** 並べ替えを、上下のボタンとキーボード (Tab と Enter) だけで正しい順にして送る。帯は階段 */
async function solveOrderByKeyboard(page, q, tag, width, phone) {
  const start = await orderIds(page);
  check(start.length === q.items.length && start.join(',') !== q.answer.join(','), `${tag} 並べ替えは正解と違う並びから始まる (${start.join(',')})`);
  await noHorizontalOverflow(page, width, `${tag} 問題 (並べ替え)`);
  await wrapsText(page, '[data-testid="order-rows"]', `${tag} 並べ替えの項目`);
  if (phone) {
    for (const id of start) {
      await checkTarget(page.getByRole('button', { name: `上へ: ${orderText(q, id)}` }), `${tag} 並べ替えの上へのボタン (${id})`, { width: true });
      await checkTarget(page.getByRole('button', { name: `下へ: ${orderText(q, id)}` }), `${tag} 並べ替えの下へのボタン (${id})`, { width: true });
    }
  }
  // マウスを使わない。手元を外してから、Tab で目当てのボタンへ運び Enter で押す
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  // 端の扱い: 下から 2 行目を下へ送ると最後の行になり、下へは押せないので手元は同じ行の上へのボタンへ移る
  {
    const ids = await orderIds(page);
    const id = ids[ids.length - 2];
    check(await tabTo(page, `下へ: ${orderText(q, id)}`), `${tag} Tab だけで下へのボタンに届く`);
    await pressEnter(page);
    const now = await orderIds(page);
    check(now.at(-1) === id, `${tag} Enter で行が 1 つ下へ動く`);
    check((await focusedLabel(page)) === `上へ: ${orderText(q, id)}`, `${tag} 最後の行に着くと、手元は同じ行の上へのボタンへ移る (${await focusedLabel(page)})`);
  }
  // 2 行目を上へ送ると最初の行になり、手元は同じ行の下へのボタンへ移る
  {
    const id = (await orderIds(page))[1];
    check(await tabTo(page, `上へ: ${orderText(q, id)}`), `${tag} Tab だけで上へのボタンに届く`);
    await pressEnter(page);
    check((await orderIds(page))[0] === id, `${tag} Enter で行が 1 つ上へ動く`);
    check((await focusedLabel(page)) === `下へ: ${orderText(q, id)}`, `${tag} 最初の行に着くと、手元は同じ行の下へのボタンへ移る (${await focusedLabel(page)})`);
  }
  // 正しい順の頭から、1 つずつ上へ送って並べる。押し続ける間、手元は動かした行のボタンに残る
  let kept = true;
  let reached = true;
  for (const [t, id] of q.answer.entries()) {
    const c = (await orderIds(page)).indexOf(id);
    if (c === t) continue;
    reached = (await tabTo(page, `上へ: ${orderText(q, id)}`)) && reached;
    for (let k = 0; k < c - t; k++) {
      await pressEnter(page);
      const atTop = (await orderIds(page)).indexOf(id) === 0;
      const want = `${atTop ? '下へ' : '上へ'}: ${orderText(q, id)}`;
      if ((await focusedLabel(page)) !== want) kept = false;
    }
  }
  check(reached, `${tag} Tab だけで各行の上へのボタンに届く`);
  check(kept, `${tag} 上下のボタンで動かしたあとも、手元は動かした行のボタンに残る`);
  check((await orderIds(page)).join(',') === q.answer.join(','), `${tag} 上下のボタンとキーボードだけで正しい順に並べられる`);
  check(await tabTo(page, 'POST 答えを送る'), `${tag} Tab だけで答えを送るボタンに届く`);
  await page.keyboard.press('Enter');
  return true;
}

/** 実習: 全部の手順に印を付けるまで終えられない。終えると X-XP: +10 と、見えるはずのことが出る */
async function finishLabChecked(page, q, tag, width, phone) {
  await noHorizontalOverflow(page, width, `${tag} 問題 (実習)`);
  await wrapsText(page, '.astryx-checkbox-list', `${tag} 実習の手順`);
  if (phone) {
    const steps = page.locator('.astryx-checkbox-list .astryx-item');
    for (let i = 0; i < (await steps.count()); i++) await checkTarget(steps.nth(i), `${tag} 実習の手順の行 ${i + 1}`);
  }
  const finishLab = page.getByRole('button', { name: 'POST 実習を終える' });
  check(await finishLab.isDisabled(), `${tag} 実習は手順に印を付けるまで終えられない`);
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await finishLab.click();
  const r = await response(page, 200);
  check(await r.getByText(`+${XP_PER_LAB}`, { exact: true }).isVisible(), `${tag} 実習を終えると X-XP: +${XP_PER_LAB}`);
  await noHorizontalOverflow(page, width, `${tag} 応答 (実習)`);
  check(await r.getByText(q.expected, { exact: false }).isVisible(), `${tag} 実習を終えると見えるはずのことが出る`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
  check(saved?.answers?.[q.id] === undefined, `${tag} 採点しない実習は正誤を残さない`);
  return true;
}

// npx の子の vite まで止められるよう、別のプロセスグループで立てる
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
// 自分のサーバーが立たなかったとき (番号が埋まっているなど)、残っている別のサーバーにつないで偽の結果を出さないよう止める
let serverExited = false;
server.on('exit', () => (serverExited = true));
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  await run(browser, 'phone', 390, 844);
  await run(browser, 'pc', 1280, 860);
  // ホームと計画の画面 (R-6・R-17・R-18)
  await runHomeAndPlan(browser, { base: BASE, check, noHorizontalOverflow });
  // おおよその予定と巻き・遅れ (R-20)
  await runSchedule(browser, { base: BASE, check, noHorizontalOverflow });
  // 復習と設定の画面 (R-13)
  await runReviewAndSettings(browser, { base: BASE, check, noHorizontalOverflow });
  // 進捗の画面と用語集 (R-14)
  await runProgressAndGlossary(browser, { base: BASE, check, noHorizontalOverflow });
  // メニューの下端の 2 つ・上の帯の GitHub のボタン・このサイトについて (B-023)
  await runAbout(browser, { base: BASE, check, noHorizontalOverflow });
  // コースの画面 (B-024)
  await runCourse(browser, { base: BASE, check, noHorizontalOverflow });
  // 模擬試験 (B-027)
  await runExam(browser, { base: BASE, check, noHorizontalOverflow });
  await runHabits(browser, { base: BASE, check, noHorizontalOverflow });
  // ページごとの共有の画像と、結果の共有のボタン (#55)
  await runShare(browser, { base: BASE, check, noHorizontalOverflow });
  // 試す画面 (#55)
  await runTry(browser, { base: BASE, check, noHorizontalOverflow });
  // 390 幅の崩れ (B-025)
  await runNarrow(browser, { base: BASE, check, noHorizontalOverflow });
  await runIntro(browser, { base: BASE, check, noHorizontalOverflow });
  // テーマと文字のコントラスト (R-16)
  await runContrast(browser, { base: BASE, check });
} catch (e) {
  console.log(`FAIL 実行中に止まりました: ${e.message}`);
  failures++;
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
console.log(failures === 0 ? 'e2e OK' : `e2e NG (${failures} 件)`);
process.exit(failures === 0 ? 0 : 1);
