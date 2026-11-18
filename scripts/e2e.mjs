#!/usr/bin/env node
// ブラウザでの通しの検査。npm run e2e で、組み立てた dist を vite preview で配り、Playwright の Chromium で操作する。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで、空の localStorage から見本のレッスン (main-w1-l1) を解いて次を確かめる:
//   1. 答える前の AI に聞くリンクに問題文が入り、正解と解説が入っていない
//   2. 不正解で 400 Bad Request・正しい答え (X-Expected)・Retry-After・解説・出典が出る
//   3. 正解で 200 OK・X-XP・解説・出典が出る
//   4. 並べ替えは 501 (準備中) を出して飛ばせる。実習は全部の手順に印を付けると終えられる
//   5. 最後の問題のあと、201 Created・正答数・結果の JSON・Location が出て、進捗 (gantlo.v1) に残る
//   6. 「もう一度解く」で 1 問目に戻り、4 択の並びが混ぜ直される。メディアタイプを誤ると 415
//   7. 知らないレッスンの id は 404。左のメニュー (スマホでは左から開く引き出し) はそのまま
//   8. どの画面も横にはみ出さない。サイトの外へは何も送らない。ページのエラーが無い
//   9. 答える前の AI のリンクは、どの種類の問題でも答えの手がかりを含まない
//  10. 途中で本文へ飛ぶリンク (skip link) を押しても、何問目かが変わらない
//  11. 390 幅では、主な操作 (閉じる・答えを送る・次へ・AI に聞く・空欄・4 択の行) の押せる範囲が 44px 以上
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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

  // 3 問目: 並べ替えは準備中 (501) で飛ばす
  await page.getByRole('heading', { name: qOrder.prompt }).waitFor();
  r = await response(page, 501);
  check(await r.getByText('Not Implemented').isVisible(), `${tag} 並べ替えは 501 Not Implemented (準備中) で飛ばせる`);
  await next(page);

  // 4 問目: 4 択。開いたときに混ぜてある。正解 (200)
  await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
  const order1 = await choiceOrder(page);
  const dataOrder = qChoice.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c.text}`);
  check(order1.length === 4 && order1.join('|') !== dataOrder.join('|'), `${tag} 4 択の選択肢は開いたときに混ぜてある (${order1.map((t) => t.slice(3, 6)).join(',')})`);
  await checkNoLeak(page, qChoice, `${tag} 4 問目`);
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
  check(await r.getByText(qLab.expected, { exact: false }).isVisible(), `${tag} 実習を終えると見えるはずのことが出る`);
  await next(page);

  // 完了: 201 Created・正答数・JSON・Location
  r = await response(page, 201);
  check(await r.getByText('Created', { exact: true }).isVisible(), `${tag} 完了は 201 Created`);
  check(await r.getByText('3 問のうち 2 問が正解').isVisible(), `${tag} 201 の説明に正答数が出る`);
  check(await page.getByText('2 / 3', { exact: true }).isVisible(), `${tag} 完了画面に正答数 2 / 3 が出る`);
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
  check(JSON.stringify(parsed) === JSON.stringify({ lesson: lesson.id, correct: 2, total: 3, xp: 16 }), `${tag} 結果の JSON は lesson・correct・total・xp (${body.replace(/\s+/g, ' ')})`);
  await noHorizontalOverflow(page, width, `${tag} 完了 201`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null'));
  check(saved?.lessons?.[lesson.id]?.done === true && Math.abs(saved.lessons[lesson.id].best - 2 / 3) < 1e-9, `${tag} 進捗にレッスンの完了と最高の正答率 (2/3) が残る`);
  check(saved?.xp?.total === 16, `${tag} 進捗に XP (16) が残る (${saved?.xp?.total})`);
  check(saved?.answers?.[qCmd.id]?.wrong === 1 && saved?.answers?.[qHttp.id]?.right === 1 && saved?.answers?.[qChoice.id]?.right === 1, `${tag} 進捗に問題ごとの正誤の回数が残る`);
  check(saved?.answers?.[qOrder.id] === undefined && saved?.answers?.[qLab.id] === undefined, `${tag} 飛ばした並べ替えと採点しない実習は正誤を残さない`);

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
  await next(page);
  await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
  const order2 = await choiceOrder(page);
  check(order2.join('|') !== order1.join('|'), `${tag} もう一度解くと 4 択の並びが混ぜ直される (${order2.map((t) => t.slice(3, 6)).join(',')})`);

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
