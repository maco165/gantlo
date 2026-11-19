// おおよその予定と巻き・遅れ (R-20) の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 今日は Playwright の clock で決め (2026-11-25 の昼)、開始日 2026-11-23 の計画と、済んだレッスン 1 つを localStorage に置いて始める。
// 計画に入れるコースとレッスンは問題データから選ぶ (レッスンが 3 つ以上ある最初のコース)。390 幅と 1280 幅で次を確かめる:
//   - 計画の画面に予定の帯 (開始日から目安の日数ぶん)・今日の線・巻き/遅れのステータスが出る。既定 (1 レッスン 1 日) では 1 日遅れ (408)
//   - 目安の日数を変えると、その場で帯 (最後の日と幅) と判定が変わる (1 レッスン 3 日で予定どおり、5 日で 2 日巻き 200)
//   - 保存すると gantlo.v1 の plan に開始日と直した日数が残り、読み直しても同じ判定。ホームの X-Schedule にも同じ判定が出る
//   - 開始日を変えると帯が動く
//   - 390 幅で、開始日と目安の日数の入力欄・ボタンが 44px 以上。横にはみ出さない。巻きと遅れの画面の文字のコントラストが 4.5:1 以上
// E2E_SHOT_DIR を付けると、各幅の計画の画面 (遅れ)・ガントチャート (遅れ・巻き)・ホームの写しをそこに置く
import { join } from 'node:path';
import { checkContrast } from './e2e-contrast.mjs';
import { loadLessons } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
const TODAY = '2026-11-25T12:00:00';
const START = '2026-11-23';

const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * @param {import('playwright').Browser} browser
 * @param {{ base: string, check: (cond: boolean, label: string) => void, noHorizontalOverflow: Function }} opts
 */
export async function runSchedule(browser, { base, check, noHorizontalOverflow }) {
  const lessons = loadLessons();
  const byCourse = new Map();
  for (const l of lessons) byCourse.set(l.course, [...(byCourse.get(l.course) ?? []), l]);
  const entry = [...byCourse.entries()].find(([, ls]) => ls.length >= 3);
  if (!entry) throw new Error('問題データに、レッスンが 3 つ以上あるコースがありません');
  const [course, courseLessons] = entry;
  const n = courseLessons.length;
  const shots = process.env.E2E_SHOT_DIR;

  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[schedule ${name}]`;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date(TODAY));

    // 開始 11-23・今日 11-25。1 レッスン済み。既定の 1 レッスン 1 日なら、昨日までの予定 2 日に対して済みは 1 日 → 1 日遅れ
    await page.goto(base);
    await page.evaluate(
      ([c, first, start]) => {
        const at = new Date('2026-11-24T12:00:00').toISOString();
        localStorage.setItem(
          'gantlo.v1',
          JSON.stringify({ v: 1, plan: { courses: [c], start }, streak: { count: 1, lastDay: '2026-11-24' }, xp: { total: 15, byDay: { '2026-11-24': 15 } }, lessons: { [first]: { done: true, best: 1, at } }, answers: {} }),
        );
      },
      [course, courseLessons[0].id, START],
    );
    await page.goto(`${base}plan/`);
    const row = page.locator(`.gantt__row[data-course="${course}"]`);
    await row.waitFor();
    const verdict = async () => ({
      code: (await page.locator('.gantt__verdict .status__code').innerText()).trim(),
      ja: (await page.locator('.gantt__verdict').innerText()).replace(/\s+/g, ' '),
      last: await row.getAttribute('data-last'),
      barW: await row.locator('.gantt__bar').evaluate((e) => e.getBoundingClientRect().width),
      trackW: await row.locator('.gantt__track').evaluate((e) => e.getBoundingClientRect().width),
    });

    // 予定の帯・今日の線・遅れ
    const v0 = await verdict();
    check((await row.getAttribute('data-first')) === START && v0.last === addDays(START, n - 1), `${tag} 予定の帯が開始日から ${n} 日 (${START}〜${v0.last})`);
    check(v0.barW > 0, `${tag} 予定の帯が見える (${Math.round(v0.barW)}px)`);
    const today = row.locator('.gantt__today');
    check((await today.count()) === 1 && (await today.isVisible()), `${tag} 今日の線が出る`);
    const todayX = await today.evaluate((e) => e.getBoundingClientRect().left);
    const barBox = await row.locator('.gantt__bar').boundingBox();
    // 今日 (3 日目の中ほど) は、帯の始まりから 2.5 日ぶんの位置。帯の 1 日の幅は barW / n (軸 = 帯)
    const wantX = barBox.x + (2.5 * barBox.width) / n;
    check(Math.abs(todayX + 1.5 - wantX) <= 2, `${tag} 今日の線は 3 日目の中ほど (${Math.round(todayX)} ≒ ${Math.round(wantX)})`);
    check(v0.code === '408' && v0.ja.includes('1 日遅れ'), `${tag} 既定の日数では 408 と「1 日遅れ」 (${v0.code} ${v0.ja})`);
    await noHorizontalOverflow(page, width, `${tag} 遅れの計画の画面`);
    await checkContrast(page, check, `${tag} 遅れの計画の画面`, ['408']);
    if (shots) {
      await page.screenshot({ path: join(shots, `plan-behind-${width}.png`) });
      await page.locator('.gantt').screenshot({ path: join(shots, `gantt-behind-${width}.png`) });
    }

    // 目安の日数を変えると、その場で帯と判定が変わる
    const days = page.getByLabel(new RegExp(`の目安の日数$`)).first();
    check((await days.inputValue()) === String(n), `${tag} 目安の日数の既定はレッスン数 (${await days.inputValue()} = ${n})`);
    await days.fill(String(3 * n));
    const v1 = await verdict();
    check(v1.code === '200' && v1.ja.includes('予定どおり'), `${tag} 1 レッスン 3 日にすると 200 と「予定どおり」 (${v1.code} ${v1.ja})`);
    check(v1.last === addDays(START, 3 * n - 1), `${tag} 帯の最後の日が延びる (${v1.last})`);
    await days.fill(String(5 * n));
    const v2 = await verdict();
    check(v2.code === '200' && v2.ja.includes('2 日巻き'), `${tag} 1 レッスン 5 日にすると 200 と「2 日巻き」 (${v2.code} ${v2.ja})`);
    check(v2.last === addDays(START, 5 * n - 1), `${tag} 帯の最後の日がさらに延びる (${v2.last})`);
    await noHorizontalOverflow(page, width, `${tag} 巻きの計画の画面`);
    await checkContrast(page, check, `${tag} 巻きの計画の画面`, ['200']);
    if (width < 768) {
      // 押せる部品 (開始日・目安の日数・ボタン) が 44px 以上
      const sizes = await page
        .locator('.page input, .page button')
        .evaluateAll((els) => els.filter((e) => e.type !== 'checkbox').map((e) => [e.getAttribute('aria-label') ?? e.id ?? e.textContent?.trim(), e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
      const small = sizes.filter(([, w, h]) => w < MIN_TARGET || h < MIN_TARGET);
      check(sizes.length >= 3 && small.length === 0, `${tag} 開始日・目安の日数・ボタン ${sizes.length} 個がどれも ${MIN_TARGET}px 以上 ${small.map((s) => s.join(':')).join(' ')}`);
    }
    if (shots) await page.locator('.gantt').screenshot({ path: join(shots, `gantt-ahead-${width}.png`) });

    // 保存すると開始日と直した日数が残り、読み直しても同じ判定
    await page.getByRole('button', { name: 'PUT この順で学ぶ' }).click();
    await page.locator('.plan__save .status__code').waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null')?.plan);
    check(JSON.stringify(saved) === JSON.stringify({ courses: [course], start: START, days: { [course]: 5 * n } }), `${tag} 保存すると開始日と直した日数が残る (${JSON.stringify(saved)})`);
    await page.reload();
    await row.waitFor();
    const v3 = await verdict();
    check(v3.code === '200' && v3.ja.includes('2 日巻き') && (await days.inputValue()) === String(5 * n), `${tag} 読み直しても 2 日巻きで、日数は ${5 * n}`);

    // 開始日を変えると帯が動く (開始日を 1 日前にすると、最後の日も 1 日前になる)
    await page.locator('#plan-start').fill(addDays(START, -1));
    check((await row.getAttribute('data-first')) === addDays(START, -1) && (await row.getAttribute('data-last')) === addDays(START, 5 * n - 2), `${tag} 開始日を変えると帯が動く`);

    // ホームの X-Schedule に保存した計画の判定が出る
    await page.goto(base);
    await page.locator('[data-header="X-Schedule"]').waitFor();
    const header = (await page.locator('[data-header="X-Schedule"] dd').innerText()).trim();
    check(header === '200 2 日巻き', `${tag} ホームの X-Schedule が「200 2 日巻き」 (${header})`);
    if (shots) await page.screenshot({ path: join(shots, `home-${width}.png`) });

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
