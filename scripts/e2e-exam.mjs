// 模擬試験の画面の、ブラウザでの通しの検査 (B-027)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅) と PC (1280 幅) で、空の localStorage から次を確かめる:
//   1. /gantlo/exam/ が 200 で、メニューの「模擬試験」が選ばれ、問題の数・制限時間・合格の線・出題の範囲が出る
//   2. 始めると 40 問が出て、各週 (本編の第 1〜4 週) から 10 問ずつ。実習は出ない。同じ問題は 2 回出ない
//   3. 解いている間は正誤 (応答の枠) と AI に聞くリンクを出さず、答えを送ると次の問題へ進む。残り時間が出る
//   4. 30 問正解・10 問不正解で送ると、201 Created・合格・30 / 40・週ごとの正答率が答えたとおりに出る。
//      いちばん低い週と読み直すレッスンのリンクが出て、そのリンクでレッスンが開く
//   5. 記録 (gantlo.v1) に回が残り、間違えた問題は翌日の復習に入り、XP は正解 1 問 3 XP。試験の画面に、これまでの回が出る
//   6. 途中でやめると記録しない
//   7. 時計を進めて 60 分を過ぎると、408 Request Timeout・答えていない問題の数 (X-Unanswered) が出て、時間切れの回として残る
//   8. 並べ替えを出した直後 (0.4 秒の間) の送るは受け付けない (2 度押しの 2 回目で次の問題を送らない)
//   9. 横にはみ出さず、文が切れない。390 幅では始める・答えを送る・やめるのボタンの押せる範囲が 44px 以上。外へ何も送らず、ページのエラーが無い
import { arrangeOrder, choiceRadio, fill, loadLessons, orderIds, rightInputs, unsortedTarget } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
const KEY = 'gantlo.v1';
const SUBMIT = 'POST 答えを送って次へ';
const PER_WEEK = 10;
const TOTAL = 40;

const lessons = loadLessons();
const byId = new Map();
for (const l of lessons) {
  const m = /^main-w(\d+)-/.exec(l.id);
  if (l.course !== 'main' || !m) continue;
  for (const q of l.questions) byId.set(q.id, { q, lesson: l, week: Number(m[1]) });
}

/**
 * 開いている問題に答えて送る (right か wrong)。正誤の枠は出ないので待たない。
 * 並べ替えは出してから 0.4 秒は答えを受け付けない (2 度押しの止め) ので、その間を空けてから送る
 */
async function answerExam(page, q, right) {
  if (q.kind === 'command' || q.kind === 'http') await fill(page, right ? rightInputs(q) : q.blanks.map(() => 'zz-wrong-answer'));
  else if (q.kind === 'choice') await choiceRadio(page, q, right ? q.answer : q.choices.find((c) => c.id !== q.answer).id).check();
  else if (q.kind === 'order') await arrangeOrder(page, q, right ? q.answer : unsortedTarget(await orderIds(page), q.answer));
  if (q.kind === 'order') await page.waitForTimeout(450);
  await page.getByRole('button', { name: SUBMIT }).click();
}

const currentId = (page) => page.locator('[data-testid="exam-run"]').getAttribute('data-question');

export async function runExam(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} 模擬試験]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
    // 時計を入れておく (7. の時間切れで進める)。それまでは止めずに流す
    await context.clock.install();
    const page = await context.newPage();
    const errors = [];
    const outside = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (req.method() === 'GET' && FONT_HOSTS.includes(url.hostname)) return;
      outside.push(`${req.method()} ${req.url()}`);
    });
    const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
    const target = async (locator, label) => {
      if (!phone) return;
      const box = await locator.boundingBox();
      check(box !== null && box.height >= MIN_TARGET && box.width >= MIN_TARGET, `${tag} ${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '見えない'})`);
    };
    const statusCode = async () => (await page.locator('.status__code').first().innerText()).trim();

    // 1. 試験の画面
    const res = await page.goto(`${base}exam/`);
    check(res?.status() === 200, `${tag} /gantlo/exam/ が 200 (${res?.status()})`);
    await page.getByRole('heading', { level: 1, name: '模擬試験' }).waitFor();
    check((await statusCode()) === '200', `${tag} 始める前は 200 OK`);
    const intro = await page.locator('#astryx-app-shell-main').innerText();
    check(intro.includes('40 問') && intro.includes('60 分') && intro.includes('75% 以上'), `${tag} 問題の数・制限時間・合格の線が出る`);
    check([1, 2, 3, 4].every((w) => intro.includes(`第 ${w} 週`)), `${tag} 出題の範囲に第 1〜4 週が出る`);
    check(intro.includes('まだ受けていません'), `${tag} 空の記録では「まだ受けていません」`);
    let menu = page.locator('nav.astryx-side-nav');
    if (phone) {
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
      await page.waitForTimeout(400);
      menu = page.locator('dialog[open]');
    }
    const current = await menu.locator('a').evaluateAll((as) => as.filter((a) => a.hasAttribute('aria-current')).map((a) => a.getAttribute('href')));
    check(JSON.stringify(current) === JSON.stringify(['/gantlo/exam/']), `${tag} メニューの「模擬試験」だけが選ばれた印 (${current.join(',')})`);
    if (phone) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => ![...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
    }
    await noHorizontalOverflow(page, width, `${tag} 始める前`);
    const startBtn = page.getByRole('button', { name: '模擬試験を始める' });
    await target(startBtn, '始めるボタン');

    // 6. 途中でやめると記録しない
    await startBtn.click();
    await page.locator('[data-testid="exam-run"]').waitFor();
    const first = byId.get(await currentId(page));
    await answerExam(page, first.q, true);
    await target(page.getByRole('button', { name: '模擬試験をやめる (記録しません)' }), 'やめるボタン');
    await page.getByRole('button', { name: '模擬試験をやめる (記録しません)' }).click();
    await page.getByRole('button', { name: '模擬試験を始める' }).waitFor();
    check(((await stored())?.exams ?? []).length === 0, `${tag} 途中でやめると回の記録は残らない`);

    // 2〜4. 40 問を解く。週ごとに先頭の数問を正解にし、合わせて 30 問正解にする (第 1 週 10・第 2 週 9・第 3 週 7・第 4 週 4)
    const plan = { 1: 10, 2: 9, 3: 7, 4: 4 };
    const used = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const seen = [];
    const wrongIds = [];
    let leaked = 0;
    let noClock = 0;
    let unknown = 0;
    let guarded = null;
    await page.getByRole('button', { name: '模擬試験を始める' }).click();
    for (let i = 0; i < TOTAL; i++) {
      await page.locator('[data-testid="exam-run"]').waitFor();
      const id = await currentId(page);
      const ref = byId.get(id);
      if (!ref) {
        unknown++;
        break;
      }
      seen.push(ref);
      if ((await page.getByRole('link', { name: /Claude|ChatGPT/ }).count()) > 0) leaked++;
      if (!/残り \d\d:\d\d/.test(await page.getByTestId('exam-clock').innerText())) noClock++;
      if (i === 0) {
        await target(page.getByRole('button', { name: SUBMIT }), '答えを送るボタン');
        await noHorizontalOverflow(page, width, `${tag} 解いている途中`);
      }
      used[ref.week]++;
      const right = used[ref.week] <= plan[ref.week];
      if (!right) wrongIds.push(id);
      // 最初の並べ替えは、出た直後に送るボタンを押す (前の問題の 2 度押しの 2 回目に当たる)。受け付けず、同じ問題のまま
      if (ref.q.kind === 'order' && guarded === null) {
        await page.getByRole('button', { name: SUBMIT }).click();
        await page.waitForTimeout(100);
        guarded = (await currentId(page)) === id;
      }
      await answerExam(page, ref.q, right);
      // 正誤の枠は出さない (最後の問題のあとは結果の画面に移る)
      if (i < TOTAL - 1) {
        await page.waitForFunction((prev) => document.querySelector('[data-testid="exam-run"]')?.getAttribute('data-question') !== prev, id);
        if ((await page.locator('[data-testid="exam-run"] section.response').count()) > 0) leaked++;
      }
    }
    check(unknown === 0 && seen.length === TOTAL, `${tag} 40 問すべてが本編の問題 (${seen.length} 問)`);
    check([1, 2, 3, 4].every((w) => seen.filter((s) => s.week === w).length === PER_WEEK), `${tag} 各週 10 問ずつ (${[1, 2, 3, 4].map((w) => seen.filter((s) => s.week === w).length).join('・')})`);
    check(seen.every((s) => s.q.kind !== 'lab'), `${tag} 実習は出ない`);
    check(new Set(seen.map((s) => s.q.id)).size === TOTAL, `${tag} 同じ問題は 2 回出ない`);
    check(guarded === true, `${tag} 並べ替えを出した直後の送る (2 度押しの 2 回目) は受け付けず、同じ問題のまま (${guarded})`);
    check(leaked === 0, `${tag} 解いている間は正誤の枠と AI に聞くリンクを出さない (${leaked} か所)`);
    check(noClock === 0, `${tag} どの問題でも残り時間 (mm:ss) が出る`);

    // 4. 結果
    await page.getByRole('heading', { level: 1, name: /模擬試験の結果/ }).waitFor();
    check((await statusCode()) === '201', `${tag} 時間内に終えると 201 Created`);
    const h1 = await page.getByRole('heading', { level: 1 }).innerText();
    check(h1.includes('合格') && !h1.includes('不合格'), `${tag} 30 / 40 は合格 (${h1})`);
    const resultText = await page.locator('#astryx-app-shell-main').innerText();
    check(resultText.includes('30 / 40'), `${tag} 正答 30 / 40 が出る`);
    for (const w of [1, 2, 3, 4]) check(resultText.includes(`${plan[w]} / 10 (${plan[w] * 10}%)`), `${tag} 第 ${w} 週の正答率 ${plan[w]} / 10 が出る`);
    check(resultText.includes('いちばん低いのは第 4 週'), `${tag} いちばん低い週は第 4 週`);
    const wantReread = [...new Set(seen.filter((s) => s.week === 4 && wrongIds.includes(s.q.id)).map((s) => s.lesson.title))];
    const rereadLinks = page.locator('.exam-reread a');
    const gotReread = await rereadLinks.allInnerTexts();
    check(wantReread.length > 0 && wantReread.every((t) => gotReread.includes(t)) && gotReread.length === wantReread.length, `${tag} 読み直すレッスンは第 4 週で間違えた問題のレッスン (${gotReread.join('・')})`);
    check((await page.locator('.result__code--wrong').count()) === 10, `${tag} 問題ごとの結果に不正解が 10 行`);
    // 不正解の行には正しい答えと解説が出る (正しい答えの文は、種類ごとに模範解答・選択肢の文・正しい順)
    const expected = (q) =>
      q.kind === 'choice' ? q.choices.find((c) => c.id === q.answer).text : q.kind === 'order' ? q.answer.map((id) => q.items.find((it) => it.id === id).text).join(' → ') : q.blanks.map((b) => b.answers[0]).join(' / ');
    const rowsText = await page.locator('section[aria-labelledby="exam-rows"]').innerText();
    const missingWhy = wrongIds.map((id) => byId.get(id).q).filter((q) => !rowsText.includes(`正しい答え: ${expected(q)}`) || !rowsText.includes(q.explanation));
    check(missingWhy.length === 0, `${tag} 不正解の 10 行に正しい答えと解説が出る ${missingWhy.map((q) => q.id).join(' ')}`);
    await noHorizontalOverflow(page, width, `${tag} 結果`);

    // 5. 記録
    const p = await stored();
    const rec = p?.exams?.[0];
    check(p?.exams?.length === 1 && rec.correct === 30 && rec.total === 40 && rec.timeUp === false, `${tag} 回の記録が残る (${JSON.stringify(rec)})`);
    check(wrongIds.every((id) => typeof p.answers[id]?.nextReview === 'string'), `${tag} 間違えた 10 問が復習に入る`);
    check(p.xp.total === 30 * 3, `${tag} XP は正解 1 問 3 XP で 90 (${p.xp.total})`);

    // 4. 読み直すレッスンのリンクでレッスンが開く
    await rereadLinks.first().click();
    await page.locator('.lesson-bar').waitFor();
    check(page.url().includes('/lesson/main-w4-'), `${tag} 読み直すリンクで第 4 週のレッスンが開く (${new URL(page.url()).pathname})`);

    // 5. 試験の画面に、これまでの回が出る
    await page.goto(`${base}exam/`);
    await page.getByRole('heading', { level: 1, name: '模擬試験' }).waitFor();
    const history = await page.locator('#astryx-app-shell-main').innerText();
    check(history.includes('30 / 40 問 (75%)') && history.includes('合格'), `${tag} これまでの回に 30 / 40 問 (75%)・合格が出る`);

    // 7. 時間切れ: 2 問答えてから 60 分を進める
    await page.getByRole('button', { name: '模擬試験を始める' }).click();
    for (let i = 0; i < 2; i++) {
      await page.locator('[data-testid="exam-run"]').waitFor();
      const id = await currentId(page);
      await answerExam(page, byId.get(id).q, true);
      await page.waitForFunction((prev) => document.querySelector('[data-testid="exam-run"]')?.getAttribute('data-question') !== prev, id);
    }
    await context.clock.fastForward('55:00');
    const low = await page.getByTestId('exam-clock').evaluate((el) => el.className);
    check(low.includes('exam-clock--low'), `${tag} 残り 5 分を切ると残り時間の色が変わる`);
    await context.clock.fastForward('06:00');
    await page.getByRole('heading', { level: 1, name: /模擬試験の結果/ }).waitFor();
    check((await statusCode()) === '408', `${tag} 60 分を過ぎると 408 Request Timeout`);
    const unanswered = (await page.locator('.headers__row', { hasText: 'X-Unanswered' }).locator('dd').innerText()).trim();
    check(unanswered.startsWith('38'), `${tag} 答えていない 38 問を X-Unanswered に出す (${unanswered.split('\n')[0]})`);
    const p2 = await stored();
    check(p2?.exams?.length === 2 && p2.exams[0].timeUp === true && p2.exams[0].correct === 2, `${tag} 時間切れの回が新しい順の先頭に残る (${JSON.stringify(p2?.exams?.[0])})`);

    check(outside.length === 0, `${tag} サイトの外へ何も送らない ${outside.join(' ')}`);
    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
