// 進捗の画面と用語集の、ブラウザでの通しの検査 (R-14)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる:
//   1. 空の記録の進捗: 正答率 —・7 日の XP 0 (7 日の棒)・コース 5 行・旅の 8 段がすべて未学習・202
//   2. 記録を入れた進捗: 正答率 (答えた 4 回のうち正解 3 回で 75%)・7 日の XP (今日と 3 日前の合計、8 日前は入れない)・
//      コースごとの済みがデータのレッスンの数どおり・本編の正答率・旅の段は選んだレッスンの段だけが学習済み・206
//      (記録に入れるレッスンは scripts/e2e-lessons.mjs の loadLessons で問題データから選ぶ。中身を決め打ちしない)
//   3. 用語集: 一覧に全部の語が出て、11 の規格が学ぶ順に先に並ぶ。語を選ぶと説明・出典 (https・新しいタブ)・出てくるレッスンが出る
//      (PC は一覧の右の枠、スマホは行が開き、もう一度押すと閉じる)。分類の札 (すべて・規格・問題に出る語) で一覧が絞られる
//   4. 全角で探せる: 「ＨＴＴＰ」で HTTP、半角カナの「ﾘｿｰｽ」でリソースが先頭。当たらなければ 204 で語が出ない。消すと全部に戻る
//   5. 語の「出てくるレッスン」のリンクで、そのレッスンが開く
//   6. メニューの進捗と用語集に「準備中」が付かない。ページの題が「進捗」「用語集」で始まる
//   7. 横にはみ出さず、文が切れない。390 幅では押せる所 (探す欄・出典とレッスンのリンク・進捗の下のリンク) が 44px 以上。
//      外へ何も送らず、ページのエラーが無い
import { readFileSync } from 'node:fs';
import { COURSE_ORDER, findLessonWith, loadLessons, startLesson } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
const KEY = 'gantlo.v1';
const glossary = JSON.parse(readFileSync(new URL('../src/content/glossary.json', import.meta.url), 'utf8'));
const LESSONS = loadLessons();
/** 記録に入れるレッスン: 本編で、採点する問題 (実習でない) を 3 問以上持つ最初のもの */
const lesson = findLessonWith(LESSONS, (l) => l.course === 'main' && l.questions.filter((q) => q.kind !== 'lab').length >= 3, '採点する問題を 3 問以上持つ本編');
const [q1, q2, q4] = lesson.questions.filter((q) => q.kind !== 'lab');
const COURSE_TITLES = { main: '本編 4 週', spring: 'Spring Boot の流れ', 'tech-history': '技術の歴史', 'mgmt-history': '管理の歴史', security: 'セキュリティ' };
/** 用語集のリンクを試す語: 出てくるレッスンを持つ最初の語と、そのレッスン */
const linkTerm = glossary.terms.find((t) => t.lessons.length > 0);
const linkLesson = linkTerm && LESSONS.find((l) => l.id === linkTerm.lessons[0]);
const TERM_COUNT = glossary.terms.length;
const STANDARDS = glossary.terms
  .filter((t) => t.standard !== undefined)
  .sort((a, b) => a.standard - b.standard)
  .map((t) => t.id);

export async function runProgressAndGlossary(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} 進捗と用語集]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
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
      const small = boxes.filter((b) => b === null || b.height < MIN_TARGET || b.width < MIN_TARGET);
      check(
        boxes.length > 0 && small.length === 0,
        `${tag} ${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${boxes.length} 個${small.length ? `、届かない ${small.map((b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '見えない')).join(' ')}` : ''})`,
      );
    };
    /**
     * 画面が条件を満たすまで 5 秒だけ待つ。待ち切れたら FAIL の行に理由を出して先へ進む
     * (検査全体を止めず、後ろの検査も走らせる)。満たしたかを返す
     */
    const waitUntil = async (fn, arg, label) => {
      try {
        await page.waitForFunction(fn, arg, { timeout: 5000 });
        return true;
      } catch {
        check(false, `${tag} ${label} (5 秒待っても満たさない)`);
        return false;
      }
    };
    const stat = async (k) => (await page.locator(`[data-stat="${k}"] dd`).innerText()).trim();
    const code = async () => (await page.locator('.status__code').first().innerText()).trim();

    // 1. 空の記録の進捗
    await page.goto(`${base}progress/`);
    await page.getByRole('heading', { name: '進捗', exact: true }).waitFor();
    check((await page.title()).startsWith('進捗'), `${tag} ページの題が「進捗」で始まる`);
    check((await stat('accuracy')) === '—' && (await stat('week-xp')) === '0', `${tag} 空の記録では正答率 — と 7 日の XP 0`);
    check((await page.locator('.xp7__col').count()) === 7, `${tag} この 7 日の XP は 7 本の棒`);
    check((await page.locator('.prog__table tbody tr').count()) === 5, `${tag} コースごとの進み具合は 5 コースの行`);
    check((await page.locator('.wf__row[data-learned="false"]').count()) === 8, `${tag} 旅の 8 段がすべて未学習`);
    check((await code()) === '202', `${tag} 空の記録では 202`);
    await noHorizontalOverflow(page, width, `${tag} 進捗 (空)`);

    // 2. 記録を入れる: 答えた 4 回のうち正解 3 回、本編のレッスン 1 つが済み、XP は今日 15・3 日前 6・8 日前 99 (入らない)
    const seeded = await page.evaluate(
      ({ k, ids, lessonId }) => {
        const key = (n) => {
          const d = new Date();
          d.setDate(d.getDate() - n);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const today = key(0);
        localStorage.setItem(
          k,
          JSON.stringify({
            v: 1,
            streak: { count: 2, lastDay: today },
            xp: { total: 120, byDay: { [today]: 15, [key(3)]: 6, [key(8)]: 99 } },
            lessons: { [lessonId]: { done: true, best: 0.75, at: new Date().toISOString() } },
            answers: {
              [ids[0]]: { right: 1, wrong: 0, last: '' },
              [ids[1]]: { right: 0, wrong: 1, last: '', stage: 0, nextReview: key(-1) },
              [ids[2]]: { right: 2, wrong: 0, last: '' },
            },
          }),
        );
        return today;
      },
      { k: KEY, ids: [q1.id, q2.id, q4.id], lessonId: lesson.id },
    );
    await page.reload();
    await page.getByRole('heading', { name: '進捗', exact: true }).waitFor();
    check((await stat('accuracy')) === '75%', `${tag} 正答率は答えた 4 回のうち正解 3 回で 75% (${await stat('accuracy')})`);
    check(await page.getByText('レッスンと復習で答えた 4 回のうち、正解した 3 回の割合です', { exact: false }).isVisible(), `${tag} 正答率の数え方 (4 回のうち 3 回) を文で添える`);
    check((await stat('week-xp')) === '21', `${tag} 7 日の XP は今日 15 と 3 日前 6 の合計 21 (8 日前の 99 は入らない) (${await stat('week-xp')})`);
    check((await stat('streak')) === '2 日', `${tag} 連続日数が出る`);
    check((await page.locator(`.xp7__col--today`).getAttribute('data-day')) === seeded && (await page.locator('.xp7__col--today').getAttribute('data-xp')) === '15', `${tag} 今日の棒が 15 XP`);
    const main = page.locator('.prog__table tr[data-course="main"]');
    const mainText = await main.innerText();
    const mainTotal = LESSONS.filter((l) => l.course === 'main').length;
    check(mainText.includes(`1 / ${mainTotal}`) && mainText.includes('75%'), `${tag} 本編は済み 1 / ${mainTotal} で正答率 75% (${mainText.replace(/\s+/g, ' ')})`);
    for (const c of COURSE_ORDER) {
      const total = LESSONS.filter((l) => l.course === c).length;
      const row = (await page.locator(`.prog__table tr[data-course="${c}"]`).innerText()).replace(/\s+/g, ' ');
      const want = total > 0 ? `${c === 'main' ? 1 : 0} / ${total}` : '準備中';
      check(row.includes(want), `${tag} ${COURSE_TITLES[c]} の済みが ${want} (${row})`);
    }
    const learned = await page.locator('.wf__row[data-learned="true"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-stage')));
    check(JSON.stringify(learned) === JSON.stringify([lesson.stage]), `${tag} 旅の段は ${lesson.stage} だけが学習済み (${learned.join(',')})`);
    check((await code()) === '206', `${tag} 8 段のうち 1 段なので 206`);
    await noHorizontalOverflow(page, width, `${tag} 進捗 (記録あり)`);
    await target(page.locator('.prog__note a'), '進捗の下の復習と設定のリンク');

    // 3. 用語集 (B-029: PC は左の一覧と右の説明の枠、スマホは行を押すと開く。分類の札で絞る)
    await page.goto(`${base}glossary/`);
    await page.getByRole('heading', { name: '用語集', exact: true }).waitFor();
    // 用語集の画面とデータは開いたときに読む (App.tsx の lazy)。読み終えて語が出るまで待つ
    await waitUntil(() => document.querySelectorAll('li.gloss-item').length > 0, undefined, '用語集の画面を読み込んで語が出る');
    check((await page.title()).startsWith('用語集'), `${tag} ページの題が「用語集」で始まる`);
    const all = page.locator('li.gloss-item');
    check((await all.count()) === TERM_COUNT, `${tag} 一覧に全部の語 (${TERM_COUNT}) が出る (${await all.count()})`);
    const standards = await page.locator('section[aria-labelledby="gloss-standards"] li.gloss-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-term')));
    check(JSON.stringify(standards) === JSON.stringify(STANDARDS), `${tag} 11 の規格が学ぶ順に先に並ぶ (${standards.join(',')})`);
    /** 語を選ぶ (PC は一覧の項目、スマホは行を開く)。説明の箱を返す */
    const pick = async (id) => {
      await page.locator(`li.gloss-item[data-term="${id}"] button`).click();
      const box = page.locator(`article.gloss[data-term="${id}"]`);
      await box.waitFor();
      return box;
    };
    const headTerm = glossary.terms.find((t) => t.id === 'head');
    const head = await pick('head');
    check((await head.innerText()).includes(headTerm.description), `${tag} 語を選ぶと短い説明が出る`);
    {
      const src = await head.locator('a[target="_blank"]').evaluateAll((as) => as.map((a) => a.href));
      check(src.length === headTerm.sources.length && src.every((h) => h.startsWith('https://')), `${tag} 選んだ語の出典 ${headTerm.sources.length} 本が https で新しいタブに開く (${src.length})`);
      const ls = await head.locator('a[href*="/lesson/"]').count();
      check(ls === headTerm.lessons.length, `${tag} 選んだ語の出てくるレッスン ${headTerm.lessons.length} 本 (${ls})`);
    }
    check((await page.locator('article.gloss').count()) === 1, `${tag} 説明は選んだ 1 語だけに出る`);
    if (phone) {
      check((await page.locator('li.gloss-item[data-term="head"] button').getAttribute('aria-expanded')) === 'true', `${tag} スマホ: 押した行が開く (aria-expanded)`);
      await page.locator('li.gloss-item[data-term="head"] button').click();
      await waitUntil(() => document.querySelectorAll('article.gloss').length === 0, undefined, 'もう一度押すと閉じる');
      check((await page.locator('article.gloss').count()) === 0, `${tag} スマホ: もう一度押すと閉じる`);
      await target(page.locator('li.gloss-item[data-term="head"] button'), '用語の行');
      await pick('head');
    } else {
      const pane = await page.locator('#gloss-pane').boundingBox();
      const list = await page.locator('nav.gloss-index').boundingBox();
      check(pane && list && pane.x > list.x + list.width - 1, `${tag} PC: 説明の枠が一覧の右に出る (一覧 ${Math.round(list?.x ?? -1)}+${Math.round(list?.width ?? -1)}・枠 ${Math.round(pane?.x ?? -1)})`);
      check((await page.locator('li.gloss-item[data-term="head"] button').getAttribute('aria-current')) === 'true', `${tag} PC: 選んだ語が一覧で選ばれた印になる`);
    }
    await target(page.locator('article.gloss .gloss-chips a'), '出典と出てくるレッスンの札');
    await noHorizontalOverflow(page, width, `${tag} 用語集`);

    // 分類の札で一覧が絞られる
    const filterBtn = (label) => page.locator('.gloss-filter', { hasText: label });
    const standardCount = STANDARDS.length;
    await filterBtn('の規格').click();
    await waitUntil((n) => document.querySelectorAll('li.gloss-item').length === n, standardCount, '規格の札で規格だけになる');
    check((await all.count()) === standardCount && (await filterBtn('の規格').getAttribute('aria-pressed')) === 'true', `${tag} 「規格」の札で一覧が規格の ${standardCount} 語に絞られる (${await all.count()})`);
    await filterBtn('問題に出る語').click();
    await waitUntil((n) => document.querySelectorAll('li.gloss-item').length === n, TERM_COUNT - standardCount, '問題の語の札で残りだけになる');
    check((await page.locator('section[aria-labelledby="gloss-standards"]').count()) === 0, `${tag} 「問題に出る語」の札で規格のまとまりが消える (${await all.count()} 語)`);
    await target(filterBtn('すべて'), '分類の札');
    await filterBtn('すべて').click();
    await waitUntil((n) => document.querySelectorAll('li.gloss-item').length === n, TERM_COUNT, 'すべての札で全部に戻る');

    const search = page.getByRole('searchbox', { name: '用語を探す' });
    // 押せる所は欄の枠 (Astryx の .astryx-text-input) で、枠のどこを押しても入力欄に手元が移る
    const field = page.locator('[role="search"] .astryx-text-input');
    await target(field, '用語を探す欄の枠');
    {
      // placeholder は入力欄の中で切れない (… も出さずに隠れるので、字の幅を同じ字体で測って欄の幅と比べる)
      const fit = await search.evaluate((el) => {
        const cs = getComputedStyle(el, '::placeholder');
        const span = document.createElement('span');
        span.style.font = cs.font;
        span.style.whiteSpace = 'pre';
        span.style.position = 'absolute';
        span.textContent = el.placeholder;
        document.body.append(span);
        const w = span.getBoundingClientRect().width;
        span.remove();
        const pad = parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).paddingRight);
        return { w: Math.ceil(w), room: Math.floor(el.clientWidth - pad) };
      });
      check(fit.w <= fit.room, `${tag} 探す欄の placeholder が欄に収まる (字 ${fit.w}px <= 欄 ${fit.room}px)`);
    }
    if (phone) {
      const box = await field.boundingBox();
      await page.mouse.click(box.x + box.width - 8, box.y + 4);
      check(await search.evaluate((el) => el === document.activeElement), `${tag} 探す欄の枠の端を押しても入力欄に手元が移る`);
    }

    // 4. 全角で探せる
    const firstTerm = () => page.evaluate(() => document.querySelector('li.gloss-item')?.getAttribute('data-term') ?? null);
    await search.fill('ＨＴＴＰ');
    await waitUntil(() => document.querySelector('li.gloss-item')?.getAttribute('data-term') === 'http', undefined, '全角の「ＨＴＴＰ」で先頭が http になる');
    check((await firstTerm()) === 'http', `${tag} 全角の「ＨＴＴＰ」で HTTP が先頭に見つかる (先頭 ${await firstTerm()})`);
    check((await code()) === '200' && (await page.getByText(/語が見つかりました$/).isVisible()), `${tag} 見つかったら 200 と語の数`);
    await target(page.getByRole('button', { name: '用語を探す をクリア' }), '探す欄を消すボタン');
    await search.fill('ﾘｿｰｽ');
    await waitUntil(() => document.querySelector('li.gloss-item')?.getAttribute('data-term') === 'resource', undefined, '半角カナの「ﾘｿｰｽ」で先頭が resource になる');
    check((await firstTerm()) === 'resource', `${tag} 半角カナの「ﾘｿｰｽ」でリソースが先頭に見つかる (先頭 ${await firstTerm()})`);
    await search.fill('ｚｚｚ存在しない語');
    await waitUntil(() => document.querySelector('.status__code')?.textContent === '204', undefined, '当たらない語で 204 になる');
    check((await all.count()) === 0, `${tag} 当たらなければ 204 で、語は出ない`);
    await noHorizontalOverflow(page, width, `${tag} 用語集 (当たらない)`);
    await search.fill('');
    await waitUntil((n) => document.querySelectorAll('li.gloss-item').length === n, TERM_COUNT, '探す語を消すと全部の語に戻る');
    check((await all.count()) === TERM_COUNT, `${tag} 探す語を消すと全部に戻る`);

    // 5. 出てくるレッスンのリンクで、そのレッスンが開く
    check(linkLesson !== undefined, `${tag} 出てくるレッスンを持つ語があり、そのレッスンが問題データにある (${linkTerm?.id} → ${linkTerm?.lessons[0]})`);
    if (linkLesson) {
      const box = await pick(linkTerm.id);
      await box.locator(`a[href="/gantlo/lesson/${linkLesson.id}/"]`).click();
      await startLesson(page);
      await page.getByRole('heading', { name: linkLesson.questions[0].prompt }).waitFor();
      check(new URL(page.url()).pathname === `/gantlo/lesson/${linkLesson.id}/`, `${tag} 「出てくるレッスン」のリンクでレッスンが開く (${new URL(page.url()).pathname})`);
    }

    // 6. メニューに「準備中」が付かない
    if (phone) {
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.getByRole('link', { name: '用語集' }).last().waitFor();
    }
    for (const label of ['進捗', '用語集']) {
      const item = phone ? page.getByRole('link', { name: label }).last() : page.getByRole('link', { name: label }).first();
      check(!(await item.innerText()).includes('準備中'), `${tag} メニューの${label}に「準備中」が付かない`);
    }

    check(outside.length === 0, `${tag} サイトの外へは何も送らない ${outside.join(' ')}`);
    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
