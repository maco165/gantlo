// 進捗の画面と用語集の、ブラウザでの通しの検査 (R-14)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる:
//   1. 空の記録の進捗: 正答率 —・7 日の XP 0 (7 日の棒)・コース 5 行・旅の 8 段がすべて未学習・202
//   2. 記録を入れた進捗: 正答率 (答えた 4 回のうち正解 3 回で 75%)・7 日の XP (今日と 3 日前の合計、8 日前は入れない)・
//      本編の済み 1 / 1 と正答率・旅の段 http が学習済み・206
//   3. 用語集: 全部の語が説明・出典 (https・新しいタブ)・出てくるレッスンへのリンク付きで出る。11 の規格が学ぶ順に先に並ぶ
//   4. 全角で探せる: 「ＨＴＴＰ」で HTTP、半角カナの「ﾘｿｰｽ」でリソースが先頭。当たらなければ 204 で語が出ない。消すと全部に戻る
//   5. 語の「出てくるレッスン」のリンクで、そのレッスンが開く
//   6. メニューの進捗と用語集に「準備中」が付かない。ページの題が「進捗」「用語集」で始まる
//   7. 横にはみ出さず、文が切れない。390 幅では押せる所 (探す欄・出典とレッスンのリンク・進捗の下のリンク) が 44px 以上。
//      外へ何も送らず、ページのエラーが無い
import { readFileSync } from 'node:fs';

const MIN_TARGET = 44;
const KEY = 'gantlo.v1';
const glossary = JSON.parse(readFileSync(new URL('../src/content/glossary.json', import.meta.url), 'utf8'));
const week1 = JSON.parse(readFileSync(new URL('../src/content/courses/main/week1.json', import.meta.url), 'utf8'));
const lesson = week1.lessons.find((l) => l.id === 'main-w1-l1');
const [q1, q2, , q4] = lesson.questions;
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
    const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (req.method() === 'GET' && FONT_HOSTS.includes(url.hostname)) return;
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
    check(mainText.includes('1 / 1') && mainText.includes('75%'), `${tag} 本編は済み 1 / 1 で正答率 75% (${mainText.replace(/\s+/g, ' ')})`);
    check((await page.locator('.prog__table tr[data-total="0"]').count()) > 0 && (await page.locator('.prog__table tr[data-total="0"]').first().innerText()).includes('準備中'), `${tag} レッスンの無いコースは「準備中」`);
    const learned = await page.locator('.wf__row[data-learned="true"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-stage')));
    check(JSON.stringify(learned) === JSON.stringify(['http']), `${tag} 旅の段は http だけが学習済み (${learned.join(',')})`);
    check((await code()) === '206', `${tag} 8 段のうち 1 段なので 206`);
    await noHorizontalOverflow(page, width, `${tag} 進捗 (記録あり)`);
    await target(page.locator('.prog__note a'), '進捗の下の復習と設定のリンク');

    // 3. 用語集
    await page.goto(`${base}glossary/`);
    await page.getByRole('heading', { name: '用語集', exact: true }).waitFor();
    // 用語集の画面とデータは開いたときに読む (App.tsx の lazy)。読み終えて語が出るまで待つ
    await waitUntil(() => document.querySelectorAll('article.gloss').length > 0, undefined, '用語集の画面を読み込んで語が出る');
    check((await page.title()).startsWith('用語集'), `${tag} ページの題が「用語集」で始まる`);
    const all = page.locator('article.gloss');
    check((await all.count()) === TERM_COUNT, `${tag} 全部の語 (${TERM_COUNT}) が出る (${await all.count()})`);
    const standards = await page.locator('section[aria-labelledby="gloss-standards"] article.gloss').evaluateAll((els) => els.map((e) => e.getAttribute('data-term')));
    check(JSON.stringify(standards) === JSON.stringify(STANDARDS), `${tag} 11 の規格が学ぶ順に先に並ぶ (${standards.join(',')})`);
    const head = page.locator('article.gloss[data-term="head"]');
    const headTerm = glossary.terms.find((t) => t.id === 'head');
    check((await head.innerText()).includes(headTerm.description), `${tag} 語に短い説明が出る`);
    const srcLinks = await page.locator('article.gloss .gloss__meta a[target="_blank"]').evaluateAll((as) => as.map((a) => a.href));
    const sourceCount = glossary.terms.reduce((s, t) => s + t.sources.length, 0);
    check(srcLinks.length === sourceCount && srcLinks.every((h) => h.startsWith('https://')), `${tag} 出典 ${sourceCount} 本がすべて https で新しいタブに開く (${srcLinks.length})`);
    await noHorizontalOverflow(page, width, `${tag} 用語集`);
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
    await target(page.locator('article.gloss .gloss__meta a'), '出典と出てくるレッスンのリンク');

    // 4. 全角で探せる
    await search.fill('ＨＴＴＰ');
    await waitUntil(() => document.querySelector('article.gloss')?.getAttribute('data-term') === 'http', undefined, '全角の「ＨＴＴＰ」で先頭が http になる');
    {
      const first = await page.evaluate(() => document.querySelector('article.gloss')?.getAttribute('data-term') ?? null);
      check(first === 'http', `${tag} 全角の「ＨＴＴＰ」で HTTP が先頭に見つかる (先頭 ${first})`);
    }
    check((await code()) === '200' && (await page.getByText(/語が見つかりました$/).isVisible()), `${tag} 見つかったら 200 と語の数`);
    await target(page.getByRole('button', { name: '用語を探す をクリア' }), '探す欄を消すボタン');
    await search.fill('ﾘｿｰｽ');
    await waitUntil(() => document.querySelector('article.gloss')?.getAttribute('data-term') === 'resource', undefined, '半角カナの「ﾘｿｰｽ」で先頭が resource になる');
    {
      const first = await page.evaluate(() => document.querySelector('article.gloss')?.getAttribute('data-term') ?? null);
      check(first === 'resource', `${tag} 半角カナの「ﾘｿｰｽ」でリソースが先頭に見つかる (先頭 ${first})`);
    }
    await search.fill('ｚｚｚ存在しない語');
    await waitUntil(() => document.querySelector('.status__code')?.textContent === '204', undefined, '当たらない語で 204 になる');
    check((await all.count()) === 0, `${tag} 当たらなければ 204 で、語は出ない`);
    await noHorizontalOverflow(page, width, `${tag} 用語集 (当たらない)`);
    await search.fill('');
    await waitUntil((n) => document.querySelectorAll('article.gloss').length === n, TERM_COUNT, '探す語を消すと全部の語に戻る');
    check((await all.count()) === TERM_COUNT, `${tag} 探す語を消すと全部に戻る`);

    // 5. 出てくるレッスンのリンクで、そのレッスンが開く
    await head.getByRole('link', { name: new RegExp(lesson.title) }).click();
    await page.getByRole('heading', { name: q1.prompt }).waitFor();
    check(new URL(page.url()).pathname === `/gantlo/lesson/${lesson.id}/`, `${tag} 「出てくるレッスン」のリンクでレッスンが開く (${new URL(page.url()).pathname})`);

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
