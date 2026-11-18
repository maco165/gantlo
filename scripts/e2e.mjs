#!/usr/bin/env node
// ブラウザでの通しの検査。npm run e2e で、組み立てた dist を vite preview で配り、Playwright の Chromium で操作する。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで、空の localStorage から見本のレッスン (main-w1-l1) を解いて次を確かめる:
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
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runHomeAndPlan } from './e2e-home-plan.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT ?? 4328);
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/gantlo/`;
const week1 = JSON.parse(readFileSync(new URL('../src/content/courses/main/week1.json', import.meta.url), 'utf8'));
const lesson = week1.lessons.find((l) => l.id === 'main-w1-l1');
const [qCmd, qHttp, qOrder, qChoice, qLab] = lesson.questions;
const LESSON_URL = `${BASE}lesson/${lesson.id}/`;

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

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 選択肢は出すたびに混ぜるので、記号ではなく文で選ぶ
const choiceRadio = (page, choiceId) => page.getByRole('radio', { name: new RegExp(`^[A-D]\\. ${escapeRe(qChoice.choices.find((c) => c.id === choiceId).text)}$`) });
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

async function fill(page, values) {
  const inputs = page.locator('[data-testid="fill-code"] input');
  for (const [i, v] of values.entries()) await inputs.nth(i).fill(v);
}

/** 答えの手がかりになる文 (正解・解説・実行結果の例・見えること・誤りの理由) */
function secretsOf(q) {
  const out = [q.explanation];
  if (q.kind === 'command' || q.kind === 'http') for (const b of q.blanks) out.push(...b.answers);
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
  const leaked = secretsOf(q).filter((x) => text.includes(x));
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

/** 並べ替えの行に今並んでいる項目の id (上から) */
const orderIds = (page) => page.locator('[data-testid="order-rows"] > li').evaluateAll((ls) => ls.map((l) => l.dataset.item));
const orderText = (id) => qOrder.items.find((it) => it.id === id).text;
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
  // Gothic テーマの fonts.css が読む Google Fonts の GET だけは許す (字を取りに行くだけで、こちらから何も送らない)
  const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === ORIGIN || url.protocol === 'data:') return;
    if (req.method() === 'GET' && FONT_HOSTS.includes(url.hostname)) return;
    outside.push(`${req.method()} ${req.url()}`);
  });
  const tag = `[${name}]`;

  // 1 問目: コマンドの穴埋め。答える前の AI のリンク、不正解 (400)
  await page.goto(LESSON_URL);
  await page.getByRole('heading', { name: qCmd.prompt }).waitFor();
  check((await page.title()).startsWith(lesson.title), `${tag} ページの題がレッスン名で始まる`);
  check(await page.getByText(`1 / ${lesson.questions.length} 問`).first().isVisible(), `${tag} 何問目かが出る`);
  const before = await aiQuery(page);
  check(before.claude.startsWith('https://claude.ai/new?q=') && before.chatgpt.startsWith('https://chatgpt.com/?q='), `${tag} AI に聞くリンクは claude.ai/new?q= と chatgpt.com/?q=`);
  await checkNoLeak(page, qCmd, `${tag} 1 問目`);
  check((await page.getByRole('link', { name: 'Claude' }).first().getAttribute('target')) === '_blank', `${tag} AI に聞くリンクは別のタブで開く`);
  await noHorizontalOverflow(page, width, `${tag} 問題 (コマンドの穴埋め)`);
  const phone = width < 768;
  if (phone) {
    await checkTarget(page.getByRole('link', { name: 'レッスンを閉じる' }), `${tag} 閉じるボタン`, { width: true });
    await checkTarget(page.getByRole('button', { name: 'POST 答えを送る' }), `${tag} 答えを送るボタン`);
    await checkTarget(page.getByRole('link', { name: 'Claude' }), `${tag} AI に聞くリンク (Claude)`, { width: true });
    await checkTarget(page.getByRole('link', { name: 'ChatGPT' }), `${tag} AI に聞くリンク (ChatGPT)`, { width: true });
    const field = page.locator('[data-testid="fill-code"] .astryx-text-input').first();
    await checkTarget(field, `${tag} 空欄の入力`);
    // 入力欄の枠の端を押しても、文字を打てる状態になる
    const fb = await field.boundingBox();
    await page.mouse.click(fb.x + fb.width - 3, fb.y + 3);
    check(await page.evaluate(() => document.activeElement?.closest('[data-testid="fill-code"]') !== null && document.activeElement?.tagName === 'INPUT'), `${tag} 空欄の枠の端を押しても入力できる`);
  }
  await fill(page, ['-v']);
  await send(page);
  let r = await response(page, 400);
  check(await r.getByText('Bad Request').isVisible(), `${tag} 不正解は 400 Bad Request`);
  check(await r.getByText(/^不正解です/).isVisible(), `${tag} 400 に日本語の説明が付く`);
  check(await r.getByText(qCmd.blanks[0].answers[0], { exact: true }).isVisible(), `${tag} 不正解のとき X-Expected に正しい答えが出る`);
  check(await r.getByText('86400', { exact: true }).isVisible(), `${tag} 不正解のとき Retry-After: 86400 が出る`);
  check(await r.getByText(qCmd.explanation).isVisible(), `${tag} 不正解のとき解説が出る`);
  check(await sourcesShown(r, qCmd.sources), `${tag} 不正解のとき出典 (X-Source) がリンクで出る`);
  const after = await aiQuery(page);
  check(after.text.includes('不正解') && after.text.includes(qCmd.blanks[0].answers[0]), `${tag} 答えたあとの AI のリンクには自分の答えと正解が入る`);
  await noHorizontalOverflow(page, width, `${tag} 応答 400`);
  if (phone) await checkTarget(page.getByRole('button', { name: '次の問題へ' }), `${tag} 次へのボタン`);
  await next(page);

  // 2 問目: HTTP の穴埋め。正解 (200)。ヘッダー名とメディアタイプは大文字と小文字を区別しない
  await page.getByRole('heading', { name: qHttp.prompt }).waitFor();
  await checkNoLeak(page, qHttp, `${tag} 2 問目`);
  // 途中で本文へ飛ぶリンク (AppShell の skip link) を押しても、レッスンは 1 問目に戻らない
  const skip = page.locator('[data-testid="skip-to-content"]');
  check((await skip.count()) === 1, `${tag} 本文へ飛ぶリンクがある`);
  await skip.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(
    (await page.getByText(`2 / ${lesson.questions.length} 問`).first().isVisible()) && (await page.getByRole('heading', { name: qHttp.prompt }).isVisible()) && new URL(page.url()).pathname === new URL(LESSON_URL).pathname,
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
    check(
      !(await menuOpen()) && new URL(page.url()).hash === '' && (await page.getByText(`2 / ${lesson.questions.length} 問`).first().isVisible()),
      `${tag} # だけが変わる戻るでもメニューが閉じ、何問目かは変わらない`,
    );
  }
  await fill(page, ['content-type', 'Application/JSON']);
  await send(page);
  r = await response(page, 200);
  check(await r.getByText('OK', { exact: true }).isVisible(), `${tag} 正解は 200 OK`);
  check(await r.getByText('正解です').isVisible(), `${tag} 200 に日本語の説明が付く`);
  check(await r.getByText('+3', { exact: true }).isVisible(), `${tag} 正解のとき X-XP: +3 が出る`);
  check(await r.getByText(qHttp.explanation).isVisible(), `${tag} 正解のとき解説が出る`);
  check(await sourcesShown(r, qHttp.sources), `${tag} 正解のとき出典 (X-Source) がリンクで出る`);
  await noHorizontalOverflow(page, width, `${tag} 応答 200`);
  await next(page);

  // 3 問目: 並べ替え。上下のボタンとキーボード (Tab と Enter) だけで正解にする (200)。帯は階段
  await page.getByRole('heading', { name: qOrder.prompt }).waitFor();
  const start = await orderIds(page);
  check(start.length === qOrder.items.length && start.join(',') !== qOrder.answer.join(','), `${tag} 並べ替えは正解と違う並びから始まる (${start.join(',')})`);
  await checkNoLeak(page, qOrder, `${tag} 3 問目`);
  await noHorizontalOverflow(page, width, `${tag} 問題 (並べ替え)`);
  await wrapsText(page, '[data-testid="order-rows"]', `${tag} 並べ替えの項目`);
  if (phone) {
    for (const id of start) {
      await checkTarget(page.getByRole('button', { name: `上へ: ${orderText(id)}` }), `${tag} 並べ替えの上へのボタン (${id})`, { width: true });
      await checkTarget(page.getByRole('button', { name: `下へ: ${orderText(id)}` }), `${tag} 並べ替えの下へのボタン (${id})`, { width: true });
    }
  }
  // マウスを使わない。手元を外してから、Tab で目当てのボタンへ運び Enter で押す
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  // 端の扱い: 下から 2 行目を下へ送ると最後の行になり、下へは押せないので手元は同じ行の上へのボタンへ移る
  {
    const ids = await orderIds(page);
    const id = ids[ids.length - 2];
    check(await tabTo(page, `下へ: ${orderText(id)}`), `${tag} Tab だけで下へのボタンに届く`);
    await pressEnter(page);
    const now = await orderIds(page);
    check(now.at(-1) === id, `${tag} Enter で行が 1 つ下へ動く`);
    check((await focusedLabel(page)) === `上へ: ${orderText(id)}`, `${tag} 最後の行に着くと、手元は同じ行の上へのボタンへ移る (${await focusedLabel(page)})`);
  }
  // 2 行目を上へ送ると最初の行になり、手元は同じ行の下へのボタンへ移る
  {
    const id = (await orderIds(page))[1];
    check(await tabTo(page, `上へ: ${orderText(id)}`), `${tag} Tab だけで上へのボタンに届く`);
    await pressEnter(page);
    check((await orderIds(page))[0] === id, `${tag} Enter で行が 1 つ上へ動く`);
    check((await focusedLabel(page)) === `下へ: ${orderText(id)}`, `${tag} 最初の行に着くと、手元は同じ行の下へのボタンへ移る (${await focusedLabel(page)})`);
  }
  // 正しい順の頭から、1 つずつ上へ送って並べる。押し続ける間、手元は動かした行のボタンに残る
  let kept = true;
  let reached = true;
  for (const [t, id] of qOrder.answer.entries()) {
    const c = (await orderIds(page)).indexOf(id);
    if (c === t) continue;
    reached = (await tabTo(page, `上へ: ${orderText(id)}`)) && reached;
    for (let k = 0; k < c - t; k++) {
      await pressEnter(page);
      const atTop = (await orderIds(page)).indexOf(id) === 0;
      const want = `${atTop ? '下へ' : '上へ'}: ${orderText(id)}`;
      if ((await focusedLabel(page)) !== want) kept = false;
    }
  }
  check(reached, `${tag} Tab だけで各行の上へのボタンに届く`);
  check(kept, `${tag} 上下のボタンで動かしたあとも、手元は動かした行のボタンに残る`);
  check((await orderIds(page)).join(',') === qOrder.answer.join(','), `${tag} 上下のボタンとキーボードだけで正しい順に並べられる`);
  check(await tabTo(page, 'POST 答えを送る'), `${tag} Tab だけで答えを送るボタンに届く`);
  await page.keyboard.press('Enter');
  r = await response(page, 200);
  check(await r.getByText('OK', { exact: true }).isVisible(), `${tag} 並べ替えの正解は 200 OK`);
  check(await r.getByText('+3', { exact: true }).isVisible(), `${tag} 並べ替えの正解で X-XP: +3`);
  check(await r.getByText(qOrder.explanation).isVisible(), `${tag} 並べ替えの正解で解説が出る`);
  check(await sourcesShown(r, qOrder.sources), `${tag} 並べ替えの正解で出典 (X-Source) が出る`);
  const stairs = await orderBars(page);
  check(
    stairs.every((b, i) => b.ok && !b.wrongClass && (i === 0 || b.left > stairs[i - 1].left)),
    `${tag} 正しい順なら、並べた順に帯が階段に描かれる (${stairs.map((b) => Math.round(b.left)).join(',')})`,
  );
  await noHorizontalOverflow(page, width, `${tag} 応答 (並べ替え 200)`);
  await next(page);

  // 4 問目: 4 択。開いたときに混ぜてある。正解 (200)
  await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
  const order1 = await choiceOrder(page);
  const dataOrder = qChoice.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c.text}`);
  check(order1.length === 4 && order1.join('|') !== dataOrder.join('|'), `${tag} 4 択の選択肢は開いたときに混ぜてある (${order1.map((t) => t.slice(3, 6)).join(',')})`);
  await checkNoLeak(page, qChoice, `${tag} 4 問目`);
  await noHorizontalOverflow(page, width, `${tag} 問題 (4 択)`);
  await wrapsText(page, '.astryx-radio-list', `${tag} 4 択の選択肢`);
  if (phone) {
    const rows = page.locator('.astryx-radio-list-item');
    for (let i = 0; i < (await rows.count()); i++) await checkTarget(rows.nth(i), `${tag} 4 択の行 ${i + 1}`);
    // 行の右端を押しても、その選択肢が選ばれる
    const rb = await rows.nth(2).boundingBox();
    await page.mouse.click(rb.x + rb.width - 4, rb.y + 3);
    check(await page.getByRole('radio').nth(2).isChecked(), `${tag} 4 択の行の端を押しても選べる`);
  }
  await choiceRadio(page, qChoice.answer).check();
  await send(page);
  r = await response(page, 200);
  check(await r.getByText(qChoice.explanation).isVisible(), `${tag} 4 択の正解で解説が出る`);
  await next(page);

  // 5 問目: 実習。全部の手順に印を付けるまで終えられない
  await page.getByRole('heading', { name: qLab.prompt }).waitFor();
  await checkNoLeak(page, qLab, `${tag} 5 問目`);
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
  r = await response(page, 200);
  check(await r.getByText('+10', { exact: true }).isVisible(), `${tag} 実習を終えると X-XP: +10`);
  await noHorizontalOverflow(page, width, `${tag} 応答 (実習)`);
  check(await r.getByText(qLab.expected, { exact: false }).isVisible(), `${tag} 実習を終えると見えるはずのことが出る`);
  await next(page);

  // 完了: 201 Created・正答数・JSON・Location
  r = await response(page, 201);
  check(await r.getByText('Created', { exact: true }).isVisible(), `${tag} 完了は 201 Created`);
  check(await r.getByText('4 問のうち 3 問が正解').isVisible(), `${tag} 201 の説明に正答数が出る (並べ替えを含む)`);
  check(await page.getByText('3 / 4', { exact: true }).isVisible(), `${tag} 完了画面に正答数 3 / 4 が出る`);
  check(await r.getByText(`/me/lessons/${lesson.id}`, { exact: true }).isVisible(), `${tag} Location: /me/lessons/<id> が出る`);
  // CodeBlock の題と言語の札も pre の文字に入るので、最初の { から最後の } までを読む
  const raw = (await r.locator('pre').first().textContent()) ?? '';
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // 下の check で落とす
  }
  check(JSON.stringify(parsed) === JSON.stringify({ lesson: lesson.id, correct: 3, total: 4, xp: 19 }), `${tag} 結果の JSON は lesson・correct・total・xp (${body.replace(/\s+/g, ' ')})`);
  await noHorizontalOverflow(page, width, `${tag} 完了 201`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
  check(saved?.lessons?.[lesson.id]?.done === true && Math.abs(saved.lessons[lesson.id].best - 3 / 4) < 1e-9, `${tag} 進捗にレッスンの完了と最高の正答率 (3/4) が残る`);
  check(saved?.xp?.total === 19, `${tag} 進捗に XP (19) が残る (${saved?.xp?.total})`);
  check(
    saved?.answers?.[qCmd.id]?.wrong === 1 && saved?.answers?.[qHttp.id]?.right === 1 && saved?.answers?.[qOrder.id]?.right === 1 && saved?.answers?.[qChoice.id]?.right === 1,
    `${tag} 進捗に問題ごとの正誤の回数が残る (並べ替えを含む)`,
  );
  check(saved?.answers?.[qLab.id] === undefined, `${tag} 採点しない実習は正誤を残さない`);

  // もう一度解く: 1 問目に戻る。メディアタイプを誤ると 415。4 択は混ぜ直す
  await page.getByRole('button', { name: 'もう一度解く' }).click();
  await page.getByRole('heading', { name: qCmd.prompt }).waitFor();
  check(await page.getByText(`1 / ${lesson.questions.length} 問`).first().isVisible(), `${tag} もう一度解くと 1 問目に戻る`);
  await fill(page, ['--head']);
  await send(page);
  await response(page, 200);
  await next(page);
  await page.getByRole('heading', { name: qHttp.prompt }).waitFor();
  await fill(page, ['Content-Type', 'text/plain']);
  await send(page);
  r = await response(page, 415);
  check(await r.getByText('Unsupported Media Type').isVisible(), `${tag} メディアタイプの空欄を誤ると 415 Unsupported Media Type`);
  check(await r.getByText(/^メディアタイプが違います/).isVisible(), `${tag} 415 に日本語の説明が付く`);
  await next(page);
  // 並べ替えを並べ替えずに送る (始めの並びは正解と違う) と 409 Conflict。違う位置の行は誤りの色
  await page.getByRole('heading', { name: qOrder.prompt }).waitFor();
  const restartOrder = await orderIds(page);
  check(restartOrder.join(',') !== qOrder.answer.join(','), `${tag} もう一度解いても並べ替えは正解と違う並びから始まる (${restartOrder.join(',')})`);
  // 正しい位置の行と違う位置の行を混ぜるため、正しい順の先頭の項目だけを一番上へ送る (ここは押すだけなのでマウスでよい)
  const head0 = qOrder.answer[0];
  while ((await orderIds(page)).indexOf(head0) > 0) await page.getByRole('button', { name: `上へ: ${orderText(head0)}` }).click();
  const mixedOrder = await orderIds(page);
  await send(page);
  r = await response(page, 409);
  const wrongRows = mixedOrder.filter((id, i) => qOrder.answer[i] !== id).length;
  check(await r.getByText('Conflict', { exact: true }).isVisible(), `${tag} 順が違えば 409 Conflict`);
  check(await r.getByText(new RegExp(`^${wrongRows} 行が違う位置です`)).isVisible(), `${tag} 409 に「${wrongRows} 行が違う位置です」の説明が付く`);
  check(await r.getByText(qOrder.answer.map(orderText).join(' → '), { exact: true }).isVisible(), `${tag} 409 のとき X-Expected に正しい順が出る`);
  check(await r.getByText('86400', { exact: true }).isVisible(), `${tag} 409 のとき Retry-After: 86400 が出る`);
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
    bars.every((b) => (b.ok ? b.mark.includes('正しい位置') : b.mark.includes(`正しくは ${qOrder.answer.indexOf(b.id) + 1} 行目`))),
    `${tag} 違う位置の行に「正しくは <正しい順での位置> 行目」が出る (${bars.map((b) => b.mark).join(' / ')})`,
  );
  check(
    bars.every((b) => Math.abs(b.left - (qOrder.answer.indexOf(b.id) / qOrder.answer.length) * 100) < 0.01),
    `${tag} 帯はその項目の正しい順での位置に描かれる`,
  );
  await noHorizontalOverflow(page, width, `${tag} 応答 (並べ替え 409)`);
  const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
  check(savedAfter?.answers?.[qOrder.id]?.wrong === 1, `${tag} 並べ替えの誤りも正誤の回数に残る`);
  await next(page);
  await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
  const order2 = await choiceOrder(page);
  check(order2.join('|') !== order1.join('|'), `${tag} もう一度解くと 4 択の並びが混ぜ直される (${order2.map((t) => t.slice(3, 6)).join(',')})`);
  // 2 周目を終え、完了画面の一覧のコードが答えの画面と同じ (415・409) か
  await choiceRadio(page, qChoice.answer).check();
  await send(page);
  await response(page, 200);
  await next(page);
  await page.getByRole('heading', { name: qLab.prompt }).waitFor();
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'POST 実習を終える' }).click();
  await response(page, 200);
  await next(page);
  await response(page, 201);
  const listCodes = await page.locator('.result__code').allInnerTexts();
  check(
    listCodes.join(',') === '200,415,409,200,200',
    `${tag} 完了画面の一覧は答えの画面と同じコード (コマンド 200・メディアタイプの誤り 415・並べ替えの誤り 409・4 択 200・実習 200) (${listCodes.join(',')})`,
  );
  await noHorizontalOverflow(page, width, `${tag} 完了 201 (2 周目)`);

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
      const r = links.at(-1)?.getBoundingClientRect();
      return r !== undefined && r.x >= 0;
    });
    const box = await item.boundingBox();
    check(box !== null && box.x >= 0 && box.x < width / 2, `${tag} スマホのメニューは左から開く (x=${box?.x})`);
  }

  check(outside.length === 0, `${tag} サイトの外へは何も送らない (字の GET のほかに外への要求が無い) ${outside.join(' ')}`);
  check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
  await context.close();
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
