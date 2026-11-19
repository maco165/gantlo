// おおよその予定と巻き・遅れ (R-20) の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 今日は Playwright の clock で決め (2026-11-25 の昼)、開始日 2026-11-23 の計画と、済んだレッスン 1 つを localStorage に置いて始める。
// 計画に入れるコースとレッスンは問題データから選ぶ (レッスンが 3 つ以上ある最初のコース)。390 幅と 1280 幅で次を確かめる:
//   - 計画の画面に予定の帯 (開始日から目安の日数ぶん)・今日の線・巻き/遅れのステータスが出る。既定 (1 レッスン 1 日) では 1 日遅れ (408)
//   - 目安の日数を変えると、その場で帯 (最後の日と幅) と判定が変わる (1 レッスン 3 日で予定どおり、5 日で 2 日巻き 200)
//   - 保存すると gantlo.v1 の plan に開始日と直した日数が残り、読み直しても同じ判定。ホームの X-Schedule にも同じ判定が出る
//   - 開始日を変えると帯が動く
//   - 390 幅で、開始日と目安の日数の入力欄・ボタンが 44px 以上。横にはみ出さない。巻きと遅れの画面の文字のコントラストが 4.5:1 以上
//   R-21: 帯の上に日付の目盛り (週の頭・月の境) が出て字が重ならず軸からはみ出さない。表示する期間 (全体・2 週・1 か月・指定) を
//        切り替えると軸の範囲・目盛り・帯 (端で切れる) が変わり、選んだ期間は gantlo.v1 の profile に残って読み直しても同じ。
//        終わりが始まりより前の指定は aria-invalid と補助の文で知らせる。判定の色は予定どおりが成功の色 (緑)、巻きが情報の色、
//        遅れが誤りの色で、どれも字 (予定どおり・N 日巻き・N 日遅れ) を添える。390 幅で切り替えと日付の入力欄が 44px 以上
//   #33 のレビューの直し: W-001 範囲外の目安の日数は aria-invalid と「1〜365 の整数」の補助の文。W-002 計画を保存する前のホームは
//        X-Schedule が「204 計画なし」。W-003 既定と同じ日数を打って保存すると days に残らない
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

    // W-002: 計画を保存する前 (plan が無い) のホームは、済んだレッスンがあっても巻き・遅れを出さない
    await page.goto(base);
    await page.evaluate((first) => {
      const at = new Date('2026-11-20T12:00:00').toISOString();
      localStorage.setItem('gantlo.v1', JSON.stringify({ v: 1, streak: { count: 0, lastDay: null }, xp: { total: 0, byDay: {} }, lessons: { [first]: { done: true, best: 1, at } }, answers: {} }));
    }, courseLessons[0].id);
    await page.reload();
    await page.locator('[data-header="X-Schedule"]').waitFor();
    const noPlan = (await page.locator('[data-header="X-Schedule"] dd').innerText()).trim();
    check(noPlan === '204 計画なし', `${tag} 計画を保存する前のホームの X-Schedule は「204 計画なし」 (${noPlan})`);

    // 開始 11-23・今日 11-25。1 レッスン済み。既定の 1 レッスン 1 日なら、昨日までの予定 2 日に対して済みは 1 日 → 1 日遅れ
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

    // 判定の色: 済みの塗りとステータスのコードの色を、テーマの token の色と比べる
    const tokenColor = (token) =>
      page.evaluate((t) => {
        const e = document.createElement('span');
        e.style.color = `var(${t})`;
        document.body.append(e);
        const c = getComputedStyle(e).color;
        e.remove();
        return c;
      }, token);
    const tone = async () => ({
      fill: await row.locator('.gantt__done').evaluate((e) => getComputedStyle(e).backgroundColor),
      code: await page.locator('.gantt__verdict .status__code').evaluate((e) => getComputedStyle(e).color),
      legend: (await page.locator('.gantt__key--done').innerText()).trim(),
    });
    const [green, blue, red] = [await tokenColor('--color-text-success'), await tokenColor('--color-text-info'), await tokenColor('--color-text-error')];
    check(new Set([green, blue, red]).size === 3, `${tag} 成功・情報・誤りの色が別々 (${green} / ${blue} / ${red})`);
    // 目盛りの字が重ならず、軸 (帯の行) の幅からはみ出さない
    const ticksOk = async (label) => {
      const track = await row.locator('.gantt__track').boundingBox();
      const boxes = await page.locator('.gantt__tick-label').evaluateAll((els) => els.map((e) => [e.textContent, ...Object.values(e.getBoundingClientRect().toJSON())]));
      const rects = boxes.map(([text, x, y, w, h]) => ({ text, l: x, r: x + w, t: y, b: y + h }));
      const overlaps = [];
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlaps.push(`${a.text}×${b.text}`);
        }
      const outside = rects.filter((r) => r.l < track.x - 1 || r.r > track.x + track.width + 1).map((r) => r.text);
      check(rects.length > 0 && overlaps.length === 0 && outside.length === 0, `${tag} ${label}: 目盛りの字 ${rects.length} 個が重ならず、軸からはみ出さない ${overlaps.join(' ')} ${outside.join(' ')}`);
    };
    const tickDays = () => page.locator('.gantt__tick').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')));
    const axis = async () => [await page.locator('.gantt').getAttribute('data-axis-start'), await page.locator('.gantt').getAttribute('data-axis-end')];

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
    const t0 = await tone();
    check(t0.fill === red && t0.code === red && t0.legend.includes('1 日遅れ'), `${tag} 遅れは誤りの色で、凡例にも「1 日遅れ」 (${t0.fill} ${t0.code} ${t0.legend})`);
    // 全体の目盛り: 開始日 (月曜) からの週の頭と月の境
    check((await tickDays()).includes(START) && (await tickDays()).includes('2026-12-01'), `${tag} 全体の目盛りに週の頭 (${START}) と月の境 (12-01) がある`);
    await ticksOk('全体');
    await noHorizontalOverflow(page, width, `${tag} 遅れの計画の画面`);
    await checkContrast(page, check, `${tag} 遅れの計画の画面`, ['408']);
    if (shots) {
      await page.screenshot({ path: join(shots, `plan-behind-${width}.png`) });
      await page.locator('.gantt').screenshot({ path: join(shots, `gantt-behind-${width}.png`) });
    }

    // 目安の日数を変えると、その場で帯と判定が変わる
    const days = page.getByLabel(new RegExp(`の目安の日数$`)).first();
    check((await days.inputValue()) === String(n), `${tag} 目安の日数の既定はレッスン数 (${await days.inputValue()} = ${n})`);
    // W-001: 範囲外の値は知らせて、予定には入れない
    for (const bad of ['0', '400', '2.5', '-3']) {
      await days.fill(bad);
      const invalid = await days.getAttribute('aria-invalid');
      const described = await days.getAttribute('aria-describedby');
      const help = described ? (await page.locator(`#${described}`).innerText()).trim() : '';
      check(invalid === 'true' && help.includes('1〜365 の整数') && (await verdict()).code === '408', `${tag} 目安の日数に ${bad} を打つと aria-invalid と「1〜365 の整数」の補助の文が出て、予定は変わらない (${invalid} ${help})`);
    }
    if (width < 768) await checkContrast(page, check, `${tag} 目安の日数の誤りを知らせる画面`, ['408']);
    await days.fill(String(3 * n));
    check((await days.getAttribute('aria-invalid')) === null, `${tag} 正しい値に直すと aria-invalid が消える`);
    const v1 = await verdict();
    check(v1.code === '200' && v1.ja.includes('予定どおり'), `${tag} 1 レッスン 3 日にすると 200 と「予定どおり」 (${v1.code} ${v1.ja})`);
    check(v1.last === addDays(START, 3 * n - 1), `${tag} 帯の最後の日が延びる (${v1.last})`);
    const t1 = await tone();
    check(t1.fill === green && t1.code === green && t1.legend.includes('予定どおり'), `${tag} 予定どおりは成功の色 (緑) で、凡例にも「予定どおり」 (${t1.fill} ${t1.code})`);
    await days.fill(String(5 * n));
    const v2 = await verdict();
    check(v2.code === '200' && v2.ja.includes('2 日巻き'), `${tag} 1 レッスン 5 日にすると 200 と「2 日巻き」 (${v2.code} ${v2.ja})`);
    check(v2.last === addDays(START, 5 * n - 1), `${tag} 帯の最後の日がさらに延びる (${v2.last})`);
    const t2 = await tone();
    check(t2.fill === blue && t2.code === blue && t2.legend.includes('2 日巻き'), `${tag} 巻きは情報の色 (緑と別) で、凡例にも「2 日巻き」 (${t2.fill} ${t2.code})`);
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

    // R-21: 表示する期間を切り替えると、軸・目盛り・帯が変わる (今は本編が 11-23 から 5n 日)
    const barW = () => row.locator('.gantt__bar').evaluate((e) => e.getBoundingClientRect().width);
    const doneW = () => row.locator('.gantt__done').evaluate((e) => e.getBoundingClientRect().width);
    // 計画が 1 コースなので、全体では帯が軸いっぱい。済みの塗り (11-23 から 5 日ぶん) の幅で変わったことを見る
    const dAll = await doneW();
    const ticksAll = await tickDays();
    await page.getByRole('radio', { name: '2 週' }).click();
    check(JSON.stringify(await axis()) === JSON.stringify(['2026-11-25', '2026-12-08']), `${tag} 2 週にすると軸が今日から 14 日 (${await axis()})`);
    check(JSON.stringify(await tickDays()) === JSON.stringify(['2026-11-30', '2026-12-01', '2026-12-07']), `${tag} 2 週の目盛りは 11-30・12-01・12-07 (${await tickDays()})`);
    const cut2w = await row.locator('.gantt__bar').getAttribute('class');
    check(/cut-start/.test(cut2w) && /cut-end/.test(cut2w) && Math.abs((await barW()) - (await row.locator('.gantt__track').boundingBox()).width) <= 1, `${tag} 2 週では帯が両端で切れて軸いっぱい (${cut2w})`);
    const d2w = await doneW();
    check(Math.abs(d2w - dAll) > 5 && JSON.stringify(await tickDays()) !== JSON.stringify(ticksAll), `${tag} 期間を切り替えると済みの塗りの幅と目盛りが変わる (${Math.round(dAll)} → ${Math.round(d2w)}px)`);
    await ticksOk('2 週');
    await page.getByRole('radio', { name: '1 か月' }).click();
    check(JSON.stringify(await axis()) === JSON.stringify(['2026-11-25', '2026-12-24']), `${tag} 1 か月にすると軸が今日から 12-24 まで (${await axis()})`);
    await ticksOk('1 か月');
    const view1m = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null')?.profile?.ganttView);
    check(JSON.stringify(view1m) === JSON.stringify({ kind: '1m' }), `${tag} 選んだ期間は gantlo.v1 の profile に残る (${JSON.stringify(view1m)})`);
    await page.reload();
    await row.waitFor();
    check((await page.locator('.gantt').getAttribute('data-view')) === '1m' && (await page.getByRole('radio', { name: '1 か月' }).getAttribute('aria-checked')) === 'true', `${tag} 読み直しても 1 か月のまま`);
    // 指定: 今日を含まない期間では今日の線を出さない。終わりが始まりより前なら知らせて、軸は変えない
    await page.getByRole('radio', { name: '指定' }).click();
    await page.locator('#gantt-from').waitFor();
    await page.locator('#gantt-from').fill('2026-12-01');
    await page.locator('#gantt-to').fill('2026-12-10');
    check(JSON.stringify(await axis()) === JSON.stringify(['2026-12-01', '2026-12-10']), `${tag} 指定の期間が軸になる (${await axis()})`);
    check((await row.locator('.gantt__today').count()) === 0, `${tag} 今日を含まない期間では今日の線を出さない`);
    await page.locator('#gantt-to').fill('2026-11-01');
    const rangeHelp = await page.locator('#gantt-range-error').innerText();
    check(
      (await page.locator('#gantt-to').getAttribute('aria-invalid')) === 'true' && (await page.locator('#gantt-to').getAttribute('aria-describedby')) === 'gantt-range-error' && JSON.stringify(await axis()) === JSON.stringify(['2026-12-01', '2026-12-10']),
      `${tag} 終わりが始まりより前なら aria-invalid と補助の文で知らせ、軸は変えない (${rangeHelp})`,
    );
    await noHorizontalOverflow(page, width, `${tag} 期間を指定した計画の画面`);
    await checkContrast(page, check, `${tag} 期間を指定した計画の画面`, ['200']);
    if (width < 768) {
      const targets = await page
        .locator('.gantt__view [role="radio"], .gantt__view input')
        .evaluateAll((els) => els.map((e) => [e.textContent?.trim() || e.id, e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
      const small = targets.filter(([, w, h]) => w < MIN_TARGET || h < MIN_TARGET);
      check(targets.length === 6 && small.length === 0, `${tag} 期間の切り替え 4 つと日付の入力欄 2 つが ${MIN_TARGET}px 以上 ${small.map((t) => t.join(':')).join(' ')}`);
    }
    await page.locator('#gantt-to').fill('2026-12-10');
    if (shots) await page.locator('.gantt').screenshot({ path: join(shots, `gantt-range-${width}.png`) });
    await page.getByRole('radio', { name: '1 か月' }).click();
    if (shots) await page.locator('.gantt').screenshot({ path: join(shots, `gantt-1m-${width}.png`) });
    await page.getByRole('radio', { name: '全体' }).click();

    // 開始日を変えると帯が動く (開始日を 1 日前にすると、最後の日も 1 日前になる)
    await page.locator('#plan-start').fill(addDays(START, -1));
    check((await row.getAttribute('data-first')) === addDays(START, -1) && (await row.getAttribute('data-last')) === addDays(START, 5 * n - 2), `${tag} 開始日を変えると帯が動く`);

    // ホームの X-Schedule に保存した計画の判定が出る
    await page.goto(base);
    await page.locator('[data-header="X-Schedule"]').waitFor();
    const header = (await page.locator('[data-header="X-Schedule"] dd').innerText()).trim();
    check(header === '200 2 日巻き', `${tag} ホームの X-Schedule が「200 2 日巻き」 (${header})`);
    if (shots) await page.screenshot({ path: join(shots, `home-${width}.png`) });

    // W-003: 既定と同じ日数を打って保存すると、直した値として残らない
    await page.goto(`${base}plan/`);
    await row.waitFor();
    await days.fill(String(n));
    await page.getByRole('button', { name: 'PUT この順で学ぶ' }).click();
    await page.locator('.plan__save .status__code').waitFor();
    const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null')?.plan);
    check(reset?.days === undefined && JSON.stringify(reset?.courses) === JSON.stringify([course]), `${tag} 既定と同じ日数 (${n}) を打って保存すると days に残らない (${JSON.stringify(reset)})`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
