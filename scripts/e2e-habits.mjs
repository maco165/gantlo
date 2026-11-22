// 学び続ける仕組み (#55) の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅・東京) と PC (1280 幅・ロサンゼルス) で、時計を止めて次を確かめる:
//   1. 休みの札: 2 日前まで学び札を 1 個持つ記録で、ホームの X-Streak が切れず、X-Streak-Freeze に「休みの札 1 / 2」と「次に学ぶと 1 個使って」。
//      復習を 1 つ終えると連続が 1 増え、札は 0 で、使った日 (昨日) が出る
//   2. 週の目標: 設定で 3 日を選ぶと PATCH /me/profile の 200、ホームの X-Weekly-Target が「今週 n / 3 日」
//   3. .ics: 時刻と曜日 (月・水・金) を選んで書き出すと、CRLF・75 octet 以内・TZID が端末の時刻帯・RRULE の BYDAY・記録を含まない
//   4. 進捗: 26 週 × 7 日のマス (日付と数の title)・14 日の復習・到達の表・札と週の行。横にはみ出さない
//   5. まとめのカード: 保存すると 1080×1350 の PNG。共有に対応した端末 (navigator.share を差し替える) では files で渡し、文や URL を付けない
//   6. 390 幅で、新しい操作 (週の目標・曜日・書き出し・カードの保存) の押せる範囲が 44px 以上。外へ何も送らず、ページのエラーが無い
import { readFile } from 'node:fs/promises';
import { answer, loadLessons } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
const KEY = 'gantlo.v1';
const LESSONS = loadLessons();
const graded = LESSONS.filter((l) => l.course === 'main').flatMap((l) => l.questions.filter((q) => q.kind !== 'lab'));

/** 端末の日付 (YYYY-MM-DD) を、時刻帯 tz で今日から n 日ずらして作る */
const dayIn = (tz, ms, n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms + n * 86_400_000));

/** PNG の幅と高さ (IHDR) */
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

export async function runHabits(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  for (const [name, width, height, tz] of [
    ['phone', 390, 844, 'Asia/Tokyo'],
    ['pc', 1280, 860, 'America/Los_Angeles'],
  ]) {
    const tag = `[${name} 学び続ける仕組み]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height }, timezoneId: tz, acceptDownloads: true });
    // 2026-11-25 (水) の手元の 12 時ごろ
    const nowMs = Date.parse('2026-11-25T12:00:00Z') - (tz === 'Asia/Tokyo' ? 9 : -8) * 3_600_000;
    await context.clock.setFixedTime(new Date(nowMs));
    const page = await context.newPage();
    const errors = [];
    const outside = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return;
      outside.push(`${req.method()} ${req.url()}`);
    });
    const target = async (locator, label) => {
      if (!phone) return;
      const boxes = [];
      for (const el of await locator.all()) boxes.push(await el.boundingBox());
      const small = boxes.filter((b) => b === null || b.height < MIN_TARGET - 0.5 || b.width < MIN_TARGET - 0.5);
      check(boxes.length > 0 && small.length === 0, `${tag} ${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${boxes.length} 個${small.length ? `、届かない ${small.map((b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '見えない')).join(' ')}` : ''})`);
    };
    const header = async (k) => (await page.locator(`.headers__row[data-header="${k}"] dd`).first().innerText()).trim();

    // 記録: 11-17〜11-23 の 7 日学び (札 1)、11-24 は休み。復習の予定を今日に 1 問・3 日後に 1 問
    const byDay = {};
    const answered = {};
    for (let i = 8; i >= 2; i--) {
      byDay[dayIn(tz, nowMs, -i)] = 9;
      answered[dayIn(tz, nowMs, -i)] = i * 3;
    }
    const today = dayIn(tz, nowMs);
    const yesterday = dayIn(tz, nowMs, -1);
    const progress = {
      v: 1,
      streak: { count: 7, lastDay: dayIn(tz, nowMs, -2) },
      freeze: { count: 1, toward: 0, used: [] },
      xp: { total: 63, byDay },
      answered,
      lessons: {},
      answers: {
        [graded[0].id]: { right: 0, wrong: 1, last: '', stage: 0, nextReview: today, inRow: 0 },
        [graded[1].id]: { right: 1, wrong: 1, last: '', stage: 1, nextReview: dayIn(tz, nowMs, 3), inRow: 1 },
        [graded[2].id]: { right: 2, wrong: 0, last: '' },
      },
    };
    await page.goto(base);
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, progress]);

    // 1. 休みの札
    await page.goto(base);
    await page.locator('.headers__row[data-header="X-Streak-Freeze"]').waitFor();
    check((await header('X-Streak')) === '7 日連続', `${tag} 1 日休んでも札で埋められるうちは連続が切れない (${await header('X-Streak')})`);
    const fz = await header('X-Streak-Freeze');
    check(fz.startsWith('休みの札 1 / 2') && fz.includes('次に学ぶと 1 個使って'), `${tag} X-Streak-Freeze に札の数と、次に使う数 (${fz})`);
    // 今週 (月曜 11-23 から) に学んだのは 11-23 の 1 日
    check((await header('X-Weekly-Target')) === '今週 1 日 (週の目標は設定で決めます)', `${tag} 週の目標を決める前は「今週 n 日」と決める場所 (${await header('X-Weekly-Target')})`);
    // 今日の復習 (1 問) を解いて、学んだ日にする
    await page.goto(`${base}review/`);
    await page.getByRole('button', { name: '復習を始める' }).click();
    await page.getByRole('heading', { name: graded[0].prompt }).waitFor();
    await answer(page, graded[0], 'right');
    await page.locator('section.response[data-status="200"]').waitFor();
    await page.getByRole('button', { name: 'POST 結果を記録する' }).click();
    await page.getByRole('heading', { level: 1, name: '復習完了' }).waitFor();
    await page.goto(base);
    await page.locator('.headers__row[data-header="X-Streak-Freeze"]').waitFor();
    const fz2 = await header('X-Streak-Freeze');
    check((await header('X-Streak')) === '8 日連続', `${tag} 休んだ次の日に学ぶと、札を使って連続が 1 増える (${await header('X-Streak')})`);
    const [, ym, yd] = yesterday.split('-').map(Number);
    check(fz2.startsWith('休みの札 0 / 2') && fz2.includes(`使った日 ${ym}/${yd}`), `${tag} 札が 0 になり、使った日 (昨日) が出る (${fz2})`);

    // 2. 週の目標
    await page.goto(`${base}settings/`);
    await page.getByRole('heading', { level: 2, name: '週の目標' }).waitFor();
    const week = page.getByRole('radiogroup', { name: '週に学ぶ日の数 (日)' });
    await target(week.getByRole('radio'), '週の目標の切り替え');
    await week.getByRole('radio', { name: '3', exact: true }).click();
    await page.locator('.settings__outcome[data-status="200"]').waitFor();
    check((await page.locator('.settings__outcome').innerText()).includes('週の目標を 3 日にしました'), `${tag} 週の目標を選ぶと PATCH /me/profile の 200`);
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    check(saved?.profile?.weeklyGoalDays === 3, `${tag} 週の目標が記録に残る`);
    await target(page.getByRole('button', { name: '週の目標を外す' }), '週の目標を外すボタン');

    // 3. .ics
    await page.locator('#settings-ics-time').fill('07:30');
    for (const d of ['火', '木', '土', '日']) await page.getByRole('checkbox', { name: d, exact: true }).uncheck();
    await target(page.locator('.settings__day'), '曜日の選び');
    const icsButton = page.getByRole('button', { name: 'GET 予定を書き出す (.ics)' });
    await target(icsButton, '予定を書き出すボタン');
    const [ics] = await Promise.all([page.waitForEvent('download'), icsButton.click()]);
    check(ics.suggestedFilename() === 'gantlo-study.ics', `${tag} .ics のファイル名 (${ics.suggestedFilename()})`);
    const text = await readFile(await ics.path(), 'utf8');
    const lines = text.split('\r\n');
    check(text.endsWith('\r\n') && !/[^\r]\n/.test(text), `${tag} .ics の行は CRLF`);
    check(lines.every((l) => Buffer.byteLength(l) <= 75), `${tag} .ics のどの行も 75 octet 以内`);
    const unfolded = text.replace(/\r\n /g, '');
    check(unfolded.includes(`TZID:${tz}`) && new RegExp(`DTSTART;TZID=${tz}:20261127T073000`).test(unfolded), `${tag} DTSTART は端末の時刻帯 (${tz}) で、最初の予定は次の金曜 07:30`);
    check(unfolded.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'), `${tag} RRULE は選んだ曜日 (月・水・金)`);
    check(!/XP|連続|streak|answers/.test(unfolded) && unfolded.includes('URL:https://maco165.github.io/gantlo/'), `${tag} .ics はサイトの URL と短い文だけで、記録を含まない`);
    await page.locator('#settings-ics-time').fill('');
    for (const d of ['月', '水', '金']) await page.getByRole('checkbox', { name: d, exact: true }).uncheck();
    await icsButton.click();
    await page.locator('.settings__outcome[data-status="422"]').waitFor();
    check(true, `${tag} 曜日を全部外すと 422 で作らない`);
    await noHorizontalOverflow(page, width, `${tag} 設定`);

    // 2 のつづき: ホーム
    await page.goto(base);
    await page.locator('.headers__row[data-header="X-Weekly-Target"]').waitFor();
    check((await header('X-Weekly-Target')) === '今週 2 / 3 日', `${tag} ホームの X-Weekly-Target が今週 2 / 3 日 (月曜区切り。${await header('X-Weekly-Target')})`);

    // 4. 進捗
    await page.goto(`${base}progress/`);
    await page.getByTestId('calendar').waitFor();
    const cells = await page.locator('[data-testid="calendar"] li').count();
    check(cells === 26 * 7, `${tag} カレンダーは 26 週 × 7 日のマス (${cells})`);
    const d8 = dayIn(tz, nowMs, -8);
    const cell = page.locator(`[data-testid="calendar"] li[data-day="${d8}"]`);
    const title = await cell.getAttribute('title');
    check(title?.endsWith('24 問') && (await cell.getAttribute('data-level')) === '3', `${tag} マスに日付と数の title (${title})・数で濃さ (16〜30 問は 3)`);
    check((await cell.locator('.visually-hidden').textContent()) === title, `${tag} マスの読み上げは見えない文字で、title と同じ`);
    check((await page.locator('[data-testid="forecast"] li').count()) === 14, `${tag} この先 14 日の復習が 14 本`);
    // 3 日後: 入れておいた 1 問と、今日の復習で正解して 3 日後に回った 1 問
    check((await page.locator(`[data-testid="forecast"] li[data-day="${dayIn(tz, nowMs, 3)}"]`).getAttribute('data-due')) === '2', `${tag} 3 日後の復習が 2 件`);
    const mainRow = page.locator('tr[data-mastery-course="main"]');
    check((await mainRow.locator('td[data-mastery="twice"]').getAttribute('data-count')) === '1', `${tag} 到達: 一度も間違えずに 2 回正解した問題は「2 回続けて」`);
    await noHorizontalOverflow(page, width, `${tag} 進捗`);

    // 5. まとめのカード (保存)
    const saveCard = page.getByRole('button', { name: 'GET まとめのカードを保存 (PNG)' });
    await target(saveCard, 'カードの保存ボタン');
    const [png] = await Promise.all([page.waitForEvent('download'), saveCard.click()]);
    const size = pngSize(await readFile(await png.path()));
    check(size.width === 1080 && size.height === 1350 && png.suggestedFilename() === `gantlo-summary-${today}.png`, `${tag} まとめのカードは 1080×1350 の PNG (${size.width}×${size.height}・${png.suggestedFilename()})`);
    check((await page.locator('.summary-card__preview').count()) === 1, `${tag} 作ったカードを画面にも出す`);
    check((await page.getByRole('button', { name: '共有する' }).count()) === 0, `${tag} 画像の共有に対応しない端末では保存だけ`);
    await noHorizontalOverflow(page, width, `${tag} まとめのカードのあと`);

    check(outside.length === 0, `${tag} サイトの外へ何も送らない ${outside.join(' ')}`);
    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }

  // 5. 共有に対応した端末: navigator.share を差し替えて、files だけを渡すことを見る
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = (d) => Array.isArray(d?.files);
    navigator.share = async (d) => {
      window.__shared.push({ keys: Object.keys(d), files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })), text: d.text, url: d.url });
    };
  });
  const page = await context.newPage();
  await page.goto(`${base}progress/`);
  await page.getByRole('button', { name: '共有する' }).click();
  await page.waitForFunction(() => window.__shared.length > 0);
  const shared = await page.evaluate(() => window.__shared[0]);
  check(shared.files.length === 1 && shared.files[0].type === 'image/png' && shared.files[0].size > 1000 && shared.text === undefined && shared.url === undefined, `[phone まとめのカード] 共有では PNG を files で渡し、文と URL は付けない (${JSON.stringify(shared)})`);
  await context.close();
}
