// 復習と設定の画面の、ブラウザでの通しの検査 (R-13)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 時計を決めた時刻に止め、UTC と手元の日付が違う時差で走らせる (スマホは東京、PC はロサンゼルス)。手元の日付で数えていなければ落ちる:
//   1. 予定が今日 (手元の日付) の問題 2 つと、明日の問題 1 つを入れると、ホームの Retry-After と復習の画面に「今日の復習 2 問」が出る
//   2. 復習を始めて 2 問とも正解すると 200 で終わり、予定が 3 日後 (段階 1) に進み、XP が入る。レッスンの完了は付かない
//   3. 復習の画面へ戻ると「今日の復習 0 問」と 204 No Content、次の予定 (明日に 1 問) が出る。ホームの Retry-After も 0 問
//   4. 設定で 1 日の目標を 10 XP にすると記録に残り、ホームの X-Today-XP に「/ 10」で出る
//   5. 書き出すと gantlo-progress-<手元の日付>.json が保存され、中身は今の記録と同じ
//   6. 記録を消すは画面の中の確認 (dialog) を挟み、消すと記録は空で目標は残る
//   7. 壊れたファイル (JSON でない・形が違う) は 422、1 MB を超えるファイルは 413 で読み込まず理由を出し、記録は変わらない
//   8. 書き出した JSON を読み込み、確かめて置き換えると記録が戻り、読み直しても残る
//   9. 横にはみ出さず、文が切れない。390 幅では設定と復習のボタンの押せる範囲が 44px 以上。外へ何も送らず、ページのエラーが無い
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const MIN_TARGET = 44;
const KEY = 'gantlo.v1';
const week1 = JSON.parse(readFileSync(new URL('../src/content/courses/main/week1.json', import.meta.url), 'utf8'));
const lesson = week1.lessons.find((l) => l.id === 'main-w1-l1');
const [qCmd, qHttp, , qChoice] = lesson.questions;

/** YYYY-MM-DD に n 日を足す (暦の上で) */
function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const md = (day) => day.split('-').slice(1).map(Number).join('/');
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 走らせる 2 つの組。now は UTC の時刻で、local はその時刻の手元の日付、utc は UTC の日付 (local と違う日にしてある)
 */
const RUNS = [
  { name: 'phone', width: 390, height: 844, timezoneId: 'Asia/Tokyo', now: '2026-11-23T15:30:00Z', local: '2026-11-24' },
  { name: 'pc', width: 1280, height: 860, timezoneId: 'America/Los_Angeles', now: '2026-11-24T06:30:00Z', local: '2026-11-23' },
];

export async function runReviewAndSettings(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  for (const r of RUNS) {
    const { name, width, height, timezoneId, local } = r;
    const tag = `[${name} ${timezoneId}]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height }, timezoneId, acceptDownloads: true });
    // 時計だけを止める (タイマーは動かす)。手元の日付は local、UTC の日付はその前後の日。ページを開く前に context に掛ける
    await context.clock.setFixedTime(new Date(r.now));
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
      const ok = box !== null && box.height >= MIN_TARGET && box.width >= MIN_TARGET;
      check(ok, `${tag} ${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '見えない'})`);
    };
    const homeHeader = async (k) => (await page.locator(`.headers__row[data-header="${k}"] dd`).innerText()).trim();

    // 1. 予定を入れる: 今日 (手元の日付) が 2 問、明日が 1 問
    check(new Date(r.now).toISOString().slice(0, 10) !== local, `${tag} UTC の日付 (${r.now.slice(0, 10)}) と手元の日付 (${local}) が違う時刻で走らせる`);
    await page.goto(base);
    await page.evaluate(
      ({ k, ids, today, tomorrow }) => {
        const rec = (day) => ({ right: 0, wrong: 1, last: '', stage: 0, nextReview: day });
        localStorage.setItem(k, JSON.stringify({ v: 1, streak: { count: 0, lastDay: null }, xp: { total: 0, byDay: {} }, lessons: {}, answers: { [ids[0]]: rec(today), [ids[1]]: rec(today), [ids[2]]: rec(tomorrow) } }));
      },
      { k: KEY, ids: [qCmd.id, qChoice.id, qHttp.id], today: local, tomorrow: addDays(local, 1) },
    );
    await page.reload();
    await page.locator('.headers__row[data-header="Retry-After"]').waitFor();
    const pageNow = await page.evaluate(() => [new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone]);
    check(pageNow[0] === new Date(r.now).toISOString() && pageNow[1] === timezoneId, `${tag} ページの時計と時差が決めたとおり (${pageNow.join(' ')})`);
    check((await homeHeader('Retry-After')) === '今日の復習 2 問', `${tag} ホームの Retry-After が今日の復習 2 問 (${await homeHeader('Retry-After')})`);

    await page.goto(`${base}review/`);
    await page.getByRole('heading', { name: '今日の復習 2 問' }).waitFor();
    check(await page.getByText('200', { exact: true }).isVisible(), `${tag} 復習の画面は今日の分があれば 200`);
    check((await page.getByText(qCmd.prompt).count()) === 1 && (await page.getByText(qHttp.prompt).count()) === 0, `${tag} 今日の分だけが一覧に出て、明日の分は出ない`);
    check((await page.title()).startsWith('復習'), `${tag} ページの題が「復習」で始まる`);
    await noHorizontalOverflow(page, width, `${tag} 復習の一覧`);
    const start = page.getByRole('button', { name: '復習を始める' });
    await target(start, '復習を始めるボタン');

    // 2. 2 問とも正解する
    await start.click();
    await page.getByRole('heading', { name: qCmd.prompt }).waitFor();
    check(await page.getByText('今日の復習 · 1 / 2 問').isVisible(), `${tag} 復習は今日の 2 問を 1 問ずつ出す`);
    const inputs = page.locator('[data-testid="fill-code"] input');
    for (const [i, b] of qCmd.blanks.entries()) await inputs.nth(i).fill(b.answers[0]);
    await page.getByRole('button', { name: 'POST 答えを送る' }).click();
    await page.locator('section.response[data-status="200"]').waitFor();
    await page.getByRole('button', { name: '次の問題へ' }).click();
    await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
    const right = qChoice.choices.find((c) => c.id === qChoice.answer).text;
    await page.getByRole('radio', { name: new RegExp(`^[A-D]\\. ${escapeRe(right)}$`) }).check();
    await page.getByRole('button', { name: 'POST 答えを送る' }).click();
    await page.locator('section.response[data-status="200"]').waitFor();
    await page.getByRole('button', { name: 'POST 結果を記録する' }).click();
    await page.getByRole('heading', { name: '復習完了' }).waitFor();
    check(await page.getByText('今日の復習を終えました。2 問のうち 2 問が正解です').isVisible(), `${tag} 解き終えると 200 で、正答数が出る`);
    check((await page.getByRole('button', { name: 'もう一度解く' }).count()) === 0, `${tag} 復習の結果には「もう一度解く」を出さない`);
    const after = await stored();
    const in3 = addDays(local, 3);
    check(
      after?.answers?.[qCmd.id]?.stage === 1 && after.answers[qCmd.id].nextReview === in3 && after.answers[qChoice.id]?.nextReview === in3,
      `${tag} 予定日の正解で、次の予定が手元の日付の 3 日後 (${in3}) になる (${after?.answers?.[qCmd.id]?.nextReview})`,
    );
    check(after?.answers?.[qHttp.id]?.nextReview === addDays(local, 1), `${tag} 解かなかった明日の分の予定はそのまま`);
    check(after?.xp?.byDay?.[local] === 6 && Object.keys(after?.lessons ?? {}).length === 0, `${tag} 復習の XP (6) が手元の日付に入り、レッスンの完了は付かない (${JSON.stringify(after?.xp)})`);
    await noHorizontalOverflow(page, width, `${tag} 復習完了`);
    const back = page.getByRole('link', { name: '復習の画面へ戻る' });
    await target(back, '復習の画面へ戻るボタン');

    // 3. 戻ると 0 問
    await back.click();
    await page.getByRole('heading', { name: '今日の復習 0 問' }).waitFor();
    check(await page.getByText('No Content', { exact: true }).isVisible(), `${tag} 今日の復習を解くと 0 問で 204 No Content`);
    check(await page.getByText(`今日の復習はありません。次は ${md(addDays(local, 1))} に 1 問です。`).isVisible(), `${tag} 次の予定の日と数が出る`);
    await noHorizontalOverflow(page, width, `${tag} 復習 0 問`);
    await page.goto(base);
    await page.locator('.headers__row[data-header="Retry-After"]').waitFor();
    check((await homeHeader('Retry-After')) === '今日の復習 0 問', `${tag} ホームの Retry-After も 0 問`);

    // 4. 目標を 10 XP にする
    await page.goto(`${base}settings/`);
    await page.getByRole('heading', { name: '設定', exact: true }).waitFor();
    check((await page.title()).startsWith('設定'), `${tag} ページの題が「設定」で始まる`);
    await noHorizontalOverflow(page, width, `${tag} 設定`);
    for (const g of [10, 20, 30, 50]) await target(page.getByRole('radio', { name: `${g} XP` }), `目標の ${g} XP`);
    await page.getByRole('radio', { name: '10 XP' }).click();
    await page.getByText('1 日の目標を 10 XP にしました').waitFor();
    check((await stored())?.profile?.dailyGoalXp === 10, `${tag} 目標を 10 XP にすると記録に残る`);
    await page.goto(base);
    await page.locator('.headers__row[data-header="X-Today-XP"]').waitFor();
    check((await homeHeader('X-Today-XP')) === '6 / 10', `${tag} ホームの X-Today-XP に今日の XP と目標 10 が出る (${await homeHeader('X-Today-XP')})`);

    // 5. 書き出す
    await page.goto(`${base}settings/`);
    const exportButton = page.getByRole('button', { name: 'GET 記録を書き出す (JSON)' });
    await target(exportButton, '書き出すボタン');
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    check(download.suggestedFilename() === `gantlo-progress-${local}.json`, `${tag} 書き出すと手元の日付入りの JSON が保存される (${download.suggestedFilename()})`);
    const exportedText = await readFile(await download.path(), 'utf8');
    const exported = JSON.parse(exportedText);
    check(JSON.stringify(exported) === JSON.stringify(await stored()), `${tag} 書き出した中身が今の記録と同じ`);

    // 6. 記録を消す (画面の中の確認を挟む)
    const del = page.getByRole('button', { name: 'DELETE 記録を消す' });
    await target(del, '記録を消すボタン');
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      d.dismiss();
    });
    await del.click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    // 開くときの動き (拡大) が終わってから寸法を測る
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    check(await dialog.getByText('記録を消しますか?').isVisible(), `${tag} 記録を消す前に画面の中で確かめる`);
    check(JSON.stringify(await stored()) === JSON.stringify(exported), `${tag} 確かめる前は記録が残っている`);
    await target(dialog.getByRole('button', { name: '消す', exact: true }), '確かめの「消す」');
    await target(dialog.getByRole('button', { name: 'やめる' }), '確かめの「やめる」');
    await noHorizontalOverflow(page, width, `${tag} 記録を消す確かめ`);
    await dialog.getByRole('button', { name: 'やめる' }).click();
    await dialog.waitFor({ state: 'hidden' });
    check(JSON.stringify(await stored()) === JSON.stringify(exported), `${tag} やめると記録は消えない`);
    await del.click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '消す', exact: true }).click();
    await page.getByText('記録を消しました。目標と計画は残しています').waitFor();
    const cleared = await stored();
    check(
      Object.keys(cleared?.answers ?? { x: 1 }).length === 0 && cleared?.xp?.total === 0 && cleared?.profile?.dailyGoalXp === 10,
      `${tag} 消すと 204 で、記録は空で目標は残る`,
    );
    check(dialogs === 0, `${tag} ブラウザの confirm() を使わない`);

    // 7. 壊れたファイルと大きすぎるファイルは読み込まない
    const fileInput = page.locator('input[type="file"]');
    await target(page.locator('.astryx-file-input'), '記録を読み込む欄');
    const pick = (fileName, buffer) => fileInput.setInputFiles({ name: fileName, mimeType: 'application/json', buffer });
    const outcome = page.locator('.settings__outcome');
    const rejected = async (fileName, buffer, code, reason, label) => {
      await pick(fileName, buffer);
      await page.locator(`.settings__outcome[data-status="${code}"]`).waitFor();
      const text = await outcome.innerText();
      check(
        text.includes(reason) && (await page.getByRole('button', { name: 'PUT 置き換える' }).count()) === 0 && JSON.stringify(await stored()) === JSON.stringify(cleared),
        `${tag} ${label}は ${code} で読み込まず、理由を出し、記録は変わらない`,
      );
    };
    await rejected('broken.json', Buffer.from('{"v":1,"lessons":'), 422, 'JSON として読めません', '壊れたファイル (JSON でない)');
    await noHorizontalOverflow(page, width, `${tag} 読み込めない理由`);
    await rejected('other.json', Buffer.from(JSON.stringify({ v: 1, lessons: [] })), 422, 'の欄が無いか、形が違う', '形の違う JSON');
    // 中身は正しい記録で、空白を足して 1 MB を 1 バイト超える
    const big = Buffer.from(exportedText + ' '.repeat(1024 * 1024 + 1 - Buffer.byteLength(exportedText)));
    check(big.length === 1024 * 1024 + 1, `${tag} 大きいファイルは 1 MB + 1 バイト (${big.length})`);
    await rejected('big.json', big, 413, '1 MB', '1 MB を超えるファイル');

    // 8. 書き出した JSON を読み込む
    await pick(`gantlo-progress-${local}.json`, Buffer.from(exportedText));
    const confirmBox = page.locator('.settings__confirm');
    await confirmBox.waitFor();
    check(await confirmBox.getByText(/^読み込んだ記録: 完了したレッスン 0 · 答えた問題 3 \(復習の予定 3\) · 合計 6 XP$/).isVisible(), `${tag} 置き換える前に、読み込んだ記録のあらましを出す`);
    check(JSON.stringify(await stored()) === JSON.stringify(cleared), `${tag} 置き換えを押すまでは記録は変わらない`);
    await target(confirmBox.getByRole('button', { name: 'PUT 置き換える' }), '置き換えるボタン');
    await target(confirmBox.getByRole('button', { name: 'やめる' }), '読み込みをやめるボタン');
    await noHorizontalOverflow(page, width, `${tag} 読み込みの確かめ`);
    await confirmBox.getByRole('button', { name: 'PUT 置き換える' }).click();
    await page.locator('.settings__outcome[data-status="200"]').waitFor();
    check(JSON.stringify(await stored()) === JSON.stringify(exported), `${tag} 書き出した JSON を読み込むと記録が戻る`);
    await page.reload();
    await page.getByRole('heading', { name: '設定', exact: true }).waitFor();
    check(JSON.stringify(await stored()) === JSON.stringify(exported) && (await page.getByText(/答えた問題 3/).isVisible()), `${tag} 読み直しても戻した記録が残る`);
    if (phone) {
      // スマホのメニューで、復習と設定に「準備中」が付かない
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const item = page.getByRole('link', { name: '設定' }).last();
      await item.waitFor();
      check(!(await item.innerText()).includes('準備中'), `${tag} メニューの設定に「準備中」が付かない`);
    } else {
      const item = page.getByRole('link', { name: '復習' }).first();
      check(!(await item.innerText()).includes('準備中'), `${tag} メニューの復習に「準備中」が付かない`);
    }

    check(outside.length === 0, `${tag} 復習と設定で、サイトの外へは何も送らない ${outside.join(' ')}`);
    check(errors.length === 0, `${tag} 復習と設定で、ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
