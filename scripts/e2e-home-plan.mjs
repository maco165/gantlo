// ホームと計画の画面の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 空の localStorage から始め、次のことを確かめる:
//   R-6  (390 幅と 1280 幅): 旅の 8 段がすべて未学習で、最初のレッスンだけが「次」。ホームの「次」のボタンでレッスンを開いて終え、
//        ホームへ戻ると、そのレッスンが「完了」、紐づく段が「学習済み」、今日の XP が増えている。横にはみ出さない
//   R-17 (390 幅): 計画の画面でコースを選び、上下のボタンとキーボード (Tab・Enter・Space) だけで並べ替えると帯の順が変わる。
//        ボタンはどれも 44px 以上。PUT この順で学ぶ で 200 OK を出し、読み直しても同じ順
//   R-18 (1280 幅): 計画の帯・済みの塗り・今ここの印・次のレッスンへのリンクが出て、そのリンクでレッスンが開く
import { readFileSync, readdirSync } from 'node:fs';

const MIN_TARGET = 44;
const COURSES_DIR = new URL('../src/content/courses/', import.meta.url);
// 本編 → 追加のコース (src/lib/route.ts の COURSES と同じ順)。計画が無いときのホームの順
const COURSE_ORDER = ['main', 'spring', 'tech-history', 'mgmt-history', 'security'];

/** 問題データを、ホームと同じ順 (コースの順 → ファイル名の順 → ファイルの中の順) に読む */
function loadLessons() {
  const out = [];
  for (const course of COURSE_ORDER) {
    let files = [];
    try {
      files = readdirSync(new URL(`${course}/`, COURSES_DIR)).filter((f) => f.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const f of files) out.push(...JSON.parse(readFileSync(new URL(`${course}/${f}`, COURSES_DIR), 'utf8')).lessons);
  }
  return out;
}

/** 開いているレッスンを、模範解答で最後まで解く (画面は #17 のレッスンの画面) */
async function finishLesson(page, lesson) {
  const send = () => page.getByRole('button', { name: 'POST 答えを送る' }).click();
  const next = () => page.getByRole('button', { name: /^(次の問題へ|POST 結果を記録する)$/ }).click();
  for (const q of lesson.questions) {
    await page.getByRole('heading', { name: q.prompt }).waitFor();
    if (q.kind === 'command' || q.kind === 'http') {
      const inputs = page.locator('[data-testid="fill-code"] input');
      for (const [i, b] of q.blanks.entries()) await inputs.nth(i).fill(b.answers[0]);
      await send();
    } else if (q.kind === 'choice') {
      const text = q.choices.find((c) => c.id === q.answer).text;
      await page.getByRole('radio', { name: new RegExp(`^[A-D]\\. ${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).check();
      await send();
    } else if (q.kind === 'lab') {
      for (const box of await page.getByRole('checkbox').all()) await box.check();
      await page.getByRole('button', { name: 'POST 実習を終える' }).click();
    }
    await page.locator('section.response[data-status]').first().waitFor();
    await next();
  }
  await page.locator('section.response[data-status="201"]').waitFor();
}

const ganttOrder = (page) => page.locator('.gantt__row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-course')));

/** Tab を押して、名前の合うボタンに手元が来るまで進める (マウスを使わない) */
async function tabTo(page, label, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');
    if (name === label) return true;
  }
  return false;
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ base: string, check: (cond: boolean, label: string) => void }} opts
 */
export async function runHomeAndPlan(browser, { base, check }) {
  const lessons = loadLessons();
  const first = lessons[0];

  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[home ${name}]`;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const overflow = async (label) => {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `${tag} ${label}: 横にはみ出さない (scrollWidth ${sw} <= ${width})`);
    };

    // R-6: 空の localStorage のホーム
    await page.goto(base);
    await page.locator('.net__row').first().waitFor();
    const learned0 = await page.locator('.wf__row[data-learned="true"]').count();
    check((await page.locator('.wf__row').count()) === 8 && learned0 === 0, `${tag} 空の localStorage では旅の 8 段がすべて未学習`);
    const nextRows = await page.locator('.net__row[data-state="next"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-lesson')));
    check(nextRows.length === 1 && nextRows[0] === first.id, `${tag} 最初のレッスンだけが「次」 (${nextRows.join(',')})`);
    check((await page.locator('[data-header="X-Today-XP"] dd').innerText()).startsWith('0 /'), `${tag} 今日の XP は 0`);
    await overflow('空のホーム');
    const homeNext = page.locator('.home__next a');
    if (width < 768) {
      const box = await homeNext.boundingBox();
      check(box !== null && box.height >= MIN_TARGET, `${tag} 次のレッスンのボタンが ${MIN_TARGET}px 以上 (${box ? Math.round(box.height) : '-'})`);
    }

    // 次のボタンでレッスンを開いて終え、ホームへ戻る
    await homeNext.click();
    check(new URL(page.url()).pathname.endsWith(`/lesson/${first.id}/`), `${tag} 次のボタンでレッスン (${first.id}) が開く`);
    await finishLesson(page, first);
    await page.getByRole('link', { name: 'ホームへ戻る' }).first().click();
    await page.locator('.net__row').first().waitFor();
    check((await page.locator(`.net__row[data-lesson="${first.id}"]`).getAttribute('data-state')) === 'done', `${tag} 終えたレッスンが「完了」`);
    check((await page.locator(`.net__row[data-lesson="${first.id}"] .net__status`).innerText()).includes('完了'), `${tag} 完了の字が出る`);
    const learned = await page.locator('.wf__row[data-learned="true"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-stage')));
    check(learned.length === 1 && learned[0] === first.stage, `${tag} 紐づく段 (${first.stage}) だけが学習済み (${learned.join(',')})`);
    check((await page.locator(`.wf__row[data-stage="${first.stage}"]`).innerText()).includes('学習済み'), `${tag} 段に「学習済み」の字が出る`);
    const xp = Number((await page.locator('[data-header="X-Today-XP"] dd').innerText()).split('/')[0].trim());
    check(xp > 0, `${tag} 今日の目標の XP が増えた (${xp})`);
    await overflow('レッスンを終えたあとのホーム');

    if (width < 768) {
      // R-17: 390 幅で、キーボードだけで並べ替える
      const t = `[plan ${name}]`;
      await page.goto(`${base}plan/`);
      await page.locator('.gantt__row').first().waitFor();
      await overflow('計画の画面');
      // コースを選ぶ: いったん外して選び直すと最後に並ぶ (Space で切り替える)
      const box = page.locator('.plan__item[data-course="main"] input');
      await box.focus();
      await page.keyboard.press('Space');
      check(!(await ganttOrder(page)).includes('main'), `${t} 外したコースは帯にならない`);
      await page.locator('.plan__item[data-course="main"] input').focus();
      await page.keyboard.press('Space');
      const before = await ganttOrder(page);
      check(before.at(-1) === 'main', `${t} 選び直したコースは最後に並ぶ (${before.join(',')})`);
      // 上へのボタンまで Tab で進み、Enter で 1 つ、Space でもう 1 つ上げる
      await page.locator('body').focus();
      check(await tabTo(page, '本編 4 週 を上へ'), `${t} Tab で上へのボタンに届く`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      const after = await ganttOrder(page);
      const expected = [...before.slice(0, -3), 'main', ...before.slice(-3, -1)];
      check(after.join(',') === expected.join(','), `${t} キーボードだけで上へ並べ替えると帯の順が変わる (${after.join(',')})`);
      // 下へ: 隣の下へのボタンに Tab で移り、Enter と Space で 2 つ下げる (動かした行に手元が残らないと 2 回目が効かない)
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const mid = await ganttOrder(page);
      await page.keyboard.press('Space');
      const back = await ganttOrder(page);
      check(mid.join(',') === [...before.slice(0, -3), before.at(-3), 'main', before.at(-2)].join(',') && back.join(',') === before.join(','), `${t} キーボードだけで下へ並べ替えると帯の順が変わる (${mid.join(',')} → ${back.join(',')})`);
      // 最後まで下げると下へのボタンは押せなくなる。手元は同じ行の上へのボタンに移り、そのまま Enter で上げられる
      const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      check(label === '本編 4 週 を上へ', `${t} 端で押せなくなったら同じ行の反対のボタンに手元が移る (${label})`);
      await page.keyboard.press('Enter');
      const last = await ganttOrder(page);
      check(last.join(',') === [...before.slice(0, -2), 'main', before.at(-2)].join(','), `${t} 端から続けて Enter で上げられる (${last.join(',')})`);
      // ボタンはどれも 44px 以上
      const sizes = await page.locator('.page button').evaluateAll((bs) => bs.map((b) => [b.getAttribute('aria-label') ?? b.textContent?.trim(), b.getBoundingClientRect().width, b.getBoundingClientRect().height]));
      const small = sizes.filter(([, w, h]) => w < MIN_TARGET || h < MIN_TARGET);
      check(sizes.length > 0 && small.length === 0, `${t} ボタン ${sizes.length} 個がどれも ${MIN_TARGET}px 以上 ${small.map((s) => s.join(':')).join(' ')}`);
      const checkSizes = await page.locator('.plan__check').evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().height));
      check(checkSizes.every((h) => h >= MIN_TARGET), `${t} コースを選ぶ行が ${MIN_TARGET}px 以上`);
      // 保存: PUT この順で学ぶ → 200 OK。読み直しても同じ順
      check(await tabTo(page, 'PUT この順で学ぶ'), `${t} Tab で保存のボタンに届く`);
      await page.keyboard.press('Enter');
      await page.locator('.plan__save .status__code').waitFor();
      check((await page.locator('.plan__save .status__line').innerText()).replace(/\s+/g, ' ').trim() === '200 OK', `${t} 保存すると 200 OK`);
      await page.reload();
      await page.locator('.gantt__row').first().waitFor();
      check((await ganttOrder(page)).join(',') === last.join(','), `${t} 読み直しても保存した順で出る`);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gantlo.v1') ?? 'null')?.plan);
      check(JSON.stringify(saved) === JSON.stringify({ courses: last }), `${t} 計画は gantlo.v1 にコースの順だけで残る`);
    } else {
      // R-18: 1280 幅で、計画の帯・済みの塗り・今ここの印・次のレッスンへのリンク
      const t = `[plan ${name}]`;
      await page.goto(`${base}plan/`);
      await page.locator('.gantt__row').first().waitFor();
      await overflow('計画の画面');
      check((await page.locator('.gantt__bar').count()) === COURSE_ORDER.length, `${t} 計画の帯が出る`);
      const doneW = await page.locator(`.gantt__row[data-course="${first.course}"] .gantt__done`).evaluate((e) => e.getBoundingClientRect().width);
      check(doneW > 0, `${t} 済んだぶんが塗られる (${Math.round(doneW)}px)`);
      const second = lessons.find((l) => l.id !== first.id);
      if (second) {
        check((await page.locator('.gantt__here').count()) > 0 && (await page.locator('.gantt__here').first().isVisible()), `${t} 今ここの縦の印が出る`);
        const link = page.locator('.gantt__next a');
        check((await link.getAttribute('href'))?.endsWith(`/lesson/${second.id}/`) === true, `${t} 次のレッスン (${second.id}) へのリンクが出る`);
        await link.click();
        await page.getByRole('heading', { name: second.questions[0].prompt }).waitFor();
        check(new URL(page.url()).pathname.endsWith(`/lesson/${second.id}/`), `${t} 次のレッスンへのリンクでレッスンが開く`);
      } else {
        // レッスンが 1 つだけのうちは、全部済んでいるので印とリンクは出ない。印とリンクは計画を組み直す前のレッスンで確かめる
        check((await page.locator('.gantt__here').count()) === 0, `${t} 全部済んだ計画には今ここの印を出さない`);
        await page.evaluate(() => localStorage.removeItem('gantlo.v1'));
        await page.reload();
        await page.locator('.gantt__row').first().waitFor();
        check(await page.locator('.gantt__here').first().isVisible(), `${t} 今ここの縦の印が出る`);
        const link = page.locator('.gantt__next a');
        check((await link.getAttribute('href'))?.endsWith(`/lesson/${first.id}/`) === true, `${t} 次のレッスン (${first.id}) へのリンクが出る`);
        await link.click();
        await page.getByRole('heading', { name: first.questions[0].prompt }).waitFor();
        check(new URL(page.url()).pathname.endsWith(`/lesson/${first.id}/`), `${t} 次のレッスンへのリンクでレッスンが開く`);
      }
    }
    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
