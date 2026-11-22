// コースの画面 (/gantlo/course/<id>/) の通しの検査 (B-024)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる。コースのレッスンと順は問題データから読む (中身を決め打ちしない):
//   1. 5 コースの /gantlo/course/<id>/ を直に開くと HTTP の 200 で、見出しが題 (<title> の頭) と同じ、
//      Network の表にそのコースのレッスンがデータの順にそろい、空の記録では GET /course/<id> の 202 (レッスンが無ければ 204)
//   2. 2 つ以上のレッスンを持つコースで、1 つ目を済ませると 1 行目が「200 完了」、2 行目が「次」で、206 と
//      次のレッスンのボタン (GET /lesson/<2 つ目>) が出る。ボタンでレッスンが開き、表の行のリンクでも開く
//   3. 全部済ませると 200 で、次のレッスンのボタンは出ず「全部済ませました」と出る
//   4. メニューのコースに「準備中」が付かず、開いたコースの行が選ばれた印 (aria-current) になる
//   5. 390 幅で、次のレッスンのボタンと表のレッスンのリンクの押せる範囲が 44px 以上。横にはみ出さない。ページのエラーが無い
//   6. JS で描いた画面にもパンくずが出る (コースは ホーム › コース、レッスンは ホーム › コース › レッスン)。ホームのリンクでホームへ戻る
// E2E_SHOT_DIR を付けると、各幅の途中 (206) のコースの画面の写しをそこに置く
import { COURSE_ORDER, loadLessons } from './e2e-lessons.mjs';

const COURSE_TITLES = { main: '本編 4 週', spring: 'Spring Boot の流れ', 'tech-history': '技術の歴史', 'mgmt-history': '管理の歴史', security: 'セキュリティ' };

const MIN_TARGET = 44;

/** gantlo.v1 の記録 (ids のレッスンを済ませたもの) */
const progressWith = (ids) => ({
  v: 1,
  streak: { count: 0, lastDay: null },
  xp: { total: 0, byDay: {} },
  lessons: Object.fromEntries(ids.map((id) => [id, { done: true, best: 1, at: '2026-11-19T12:00:00.000Z' }])),
  answers: {},
});

export async function runCourse(browser, { base, check, noHorizontalOverflow }) {
  const lessons = loadLessons();
  const byCourse = new Map(COURSE_ORDER.map((c) => [c, lessons.filter((l) => l.course === c)]));
  const multi = COURSE_ORDER.find((c) => byCourse.get(c).length >= 2);
  if (!multi) throw new Error('問題データに、レッスンを 2 つ以上持つコースがありません');
  const shots = process.env.E2E_SHOT_DIR;

  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} コース]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const size = (b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '見えない');
    const rowIds = () => page.locator('.net__row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-lesson')));
    const statusCode = () => page.locator('.status__code').first().innerText();
    const crumbs = () => page.locator('nav.crumbs li').evaluateAll((li) => li.map((x) => x.textContent.trim()));
    const setProgress = async (ids) => {
      await page.evaluate((p) => localStorage.setItem('gantlo.v1', JSON.stringify(p)), progressWith(ids));
    };

    // 1. 5 コースを空の記録で開く
    for (const c of COURSE_ORDER) {
      const own = byCourse.get(c);
      const res = await page.goto(`${base}course/${c}/`);
      await page.locator(`.page[data-course="${c}"]`).waitFor();
      const where = `${tag} ${c}`;
      check(res?.status() === 200, `${where}: /gantlo/course/${c}/ が 200 (${res?.status()})`);
      const h1 = (await page.locator('h1').first().innerText()).trim();
      const title = await page.title();
      check(h1 !== '' && title === `${h1} | gantlo`, `${where}: 見出し「${h1}」が題 (${title}) と同じ`);
      check(await page.getByText(`GET /course/${c}`, { exact: true }).isVisible(), `${where}: GET /course/${c} の応答として出す`);
      const ids = await rowIds();
      check(JSON.stringify(ids) === JSON.stringify(own.map((l) => l.id)), `${where}: レッスン ${own.length} 個がデータの順に並ぶ (${ids.length} 行)`);
      const want = own.length > 0 ? '202' : '204';
      check((await statusCode()) === want, `${where}: 空の記録では ${want} (${await statusCode()})`);
      if (own.length > 0) {
        const first = await page.locator('.net__row').first().getAttribute('data-state');
        check(first === 'next', `${where}: 空の記録では 1 行目が「次」 (${first})`);
      }
      const cr = await crumbs();
      check(JSON.stringify(cr) === JSON.stringify(['ホーム', COURSE_TITLES[c]]), `${where}: パンくずが ホーム › ${COURSE_TITLES[c]} (${cr.join(' › ')})`);
      await noHorizontalOverflow(page, width, where);
    }

    // 6. レッスンのパンくず (題の長いレッスンでも横にはみ出さない)
    {
      const longest = [...lessons].sort((a, b) => b.title.length - a.title.length)[0];
      await page.goto(`${base}lesson/${longest.id}/`);
      await page.locator('nav.crumbs').waitFor();
      const where = `${tag} ${longest.id}`;
      const cr = await crumbs();
      check(JSON.stringify(cr) === JSON.stringify(['ホーム', COURSE_TITLES[longest.course], longest.title]), `${where}: パンくずが ホーム › コース › レッスン (${cr.join(' › ')})`);
      await noHorizontalOverflow(page, width, where);
      await page.locator('nav.crumbs a', { hasText: 'ホーム' }).click();
      await page.waitForURL(base);
      check((await page.locator('nav.crumbs').count()) === 0, `${where}: パンくずのホームでホームへ戻り、ホームにはパンくずを出さない`);
    }

    // 2. 途中 (1 つ目だけ済み)
    const own = byCourse.get(multi);
    const [l1, l2] = own;
    await setProgress([l1.id]);
    await page.goto(`${base}course/${multi}/`);
    await page.locator('.net__row').first().waitFor();
    const where = `${tag} ${multi} (途中)`;
    const states = await page.locator('.net__row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-state')));
    check(states[0] === 'done' && states[1] === 'next' && states.slice(2).every((s) => s === 'todo'), `${where}: 済みの行・次の行・まだの行が順に出る (${states.join(',')})`);
    check((await page.locator(`.net__row[data-lesson="${l1.id}"] .net__status`).innerText()).replace(/\s+/g, ' ').trim() === '200 完了', `${where}: 済みの行に「200 完了」の印`);
    check((await statusCode()) === '206', `${where}: 途中は 206 (${await statusCode()})`);
    const nextBtn = page.locator('.home__next a');
    check(
      (await nextBtn.getAttribute('href')) === `/gantlo/lesson/${l2.id}/` && (await nextBtn.innerText()).trim() === `GET /lesson/${l2.id}`,
      `${where}: 次のレッスンのボタンが 2 つ目 (${l2.id}) を指す (${await nextBtn.getAttribute('href')})`,
    );
    if (phone) {
      const b = await nextBtn.boundingBox();
      check(b !== null && b.height >= MIN_TARGET && b.width >= MIN_TARGET, `${where}: 次のレッスンのボタンが ${MIN_TARGET}px 以上 (${size(b)})`);
      const boxes = await page.locator('.net__name a').evaluateAll((as) => as.map((a) => [a.getBoundingClientRect().width, a.getBoundingClientRect().height]));
      const small = boxes.filter(([w, h]) => w < 44 || h < 44);
      check(boxes.length === own.length && small.length === 0, `${where}: 表のレッスンのリンク ${boxes.length} 本がどれも ${MIN_TARGET}px 以上 ${small.map((s) => s.map(Math.round).join('x')).join(' ')}`);
    }
    await noHorizontalOverflow(page, width, where);
    if (shots) await page.screenshot({ path: `${shots}/course-${name}.png`, fullPage: true });

    // 4. メニュー: 準備中が付かず、開いたコースが選ばれた印
    let menu = page.locator('nav.astryx-side-nav');
    if (phone) {
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
      await page.waitForTimeout(400);
      menu = page.locator('dialog[open]');
    }
    const items = menu.locator(`a[href^="/gantlo/course/"]`);
    const texts = await items.allInnerTexts();
    check(texts.length === COURSE_ORDER.length && texts.every((t) => !t.includes('準備中')), `${where}: メニューのコースに「準備中」が付かない (${texts.map((t) => t.replace(/\s+/g, ' ')).join(' / ')})`);
    const current = await items.evaluateAll((as) => as.filter((a) => a.hasAttribute('aria-current')).map((a) => a.getAttribute('href')));
    check(JSON.stringify(current) === JSON.stringify([`/gantlo/course/${multi}/`]), `${where}: メニューで開いたコースだけが選ばれた印 (${current.join(',')})`);
    if (phone) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => ![...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
    }

    // 2. 次のレッスンのボタンで開く・表の行のリンクで開く
    await nextBtn.click();
    await page.getByRole('heading', { name: l2.questions[0].prompt }).waitFor();
    check(new URL(page.url()).pathname === `/gantlo/lesson/${l2.id}/`, `${where}: 次のレッスンのボタンでレッスンが開く (${new URL(page.url()).pathname})`);
    await page.goBack();
    await page.locator(`.page[data-course="${multi}"] .net__row`).first().waitFor();
    await page.locator(`.net__row[data-lesson="${l1.id}"] .net__name a`).click();
    await page.getByRole('heading', { name: l1.questions[0].prompt }).waitFor();
    check(new URL(page.url()).pathname === `/gantlo/lesson/${l1.id}/`, `${where}: 表の行のリンクで済んだレッスンも開く (${new URL(page.url()).pathname})`);

    // 3. 全部済み
    await setProgress(own.map((l) => l.id));
    await page.goto(`${base}course/${multi}/`);
    await page.locator('.net__row').first().waitFor();
    const all = `${tag} ${multi} (全部済み)`;
    check((await statusCode()) === '200', `${all}: 全部済めば 200 (${await statusCode()})`);
    check((await page.locator('.home__next a').count()) === 0 && (await page.getByText('このコースのレッスンを全部済ませました。').isVisible()), `${all}: 次のレッスンのボタンは出ず「全部済ませました」と出る`);
    const doneStates = await page.locator('.net__row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-state')));
    check(doneStates.length === own.length && doneStates.every((s) => s === 'done'), `${all}: 全部の行が済み (${doneStates.join(',')})`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
