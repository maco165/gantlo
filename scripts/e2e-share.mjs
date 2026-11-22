// ページごとの共有の画像と、結果の共有のボタン (#55 の 7) の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
//   1. 検索に載るページ (レッスン・用語集) の head の og:image と twitter:image がそのページの og.png で、配った画像が 1200×630 の PNG。
//      記録の画面 (進捗) とホームはサイト共通の画像
//   2. レッスン完了 (390 幅): Web Share API の無い端末では「X に投稿する」(文と URL を別の引数に入れた x.com の投稿の画面・新しいタブ) と
//      「リンクをコピー」(ページの URL をクリップボードへ・200 OK) が出て、押せる範囲が 44px 以上。共有する文は点数だけ
//   3. Web Share API のある端末 (navigator.share を差し替える) では「共有する」1 つで、文と URL だけを渡す
//   4. 模擬試験の結果 (時計を 60 分進めて時間切れにする): 共有に 40 問中 0 問と模擬試験のページの URL
//   5. 外へ何も送らない (X の投稿の画面は開かずに href を見る)。ページのエラーが無い
import { answer, loadLessons } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
const LESSONS = loadLessons();
/** 解くレッスン: 問題のいちばん少ないもの (同じならデータの順で先) */
const lesson = LESSONS.reduce((best, l) => (l.questions.length < best.questions.length ? l : best));
const SITE = 'https://maco165.github.io/gantlo/';

export async function runShare(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  const errors = [];
  const outside = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return;
      outside.push(`${req.method()} ${req.url()}`);
    });
  };
  const tag = '[共有]';

  // 1. head の画像
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    watch(page);
    for (const [path, own] of [
      [`lesson/${lesson.id}/`, true],
      ['glossary/', true],
      ['progress/', false],
      ['', false],
    ]) {
      await page.goto(`${base}${path}`);
      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      const tw = await page.locator('meta[name="twitter:image"]').getAttribute('content');
      const want = own ? `${SITE}${path}og.png` : `${SITE}og.png`;
      check(og === want && tw === want, `${tag} /gantlo/${path} の og:image と twitter:image は ${own ? 'そのページの画像' : 'サイト共通の画像'} (${og})`);
      if (own) {
        const res = await page.request.get(`${base}${path}og.png`);
        const buf = await res.body();
        check(res.status() === 200 && buf.subarray(1, 4).toString('ascii') === 'PNG' && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630, `${tag} /gantlo/${path}og.png は 1200×630 の PNG (${res.status()})`);
      }
    }
    await context.close();
  }

  // 2. レッスン完了 (Web Share API の無い端末)
  const finishLesson = async (page) => {
    await page.goto(`${base}lesson/${lesson.id}/`);
    for (let i = 0; i < lesson.questions.length; i++) {
      await answer(page, lesson.questions[i], 'right');
      await page.getByRole('button', { name: i === lesson.questions.length - 1 ? 'POST 結果を記録する' : '次の問題へ' }).click();
    }
    await page.getByTestId('share').waitFor();
  };
  const graded = lesson.questions.filter((q) => q.kind !== 'lab').length;
  const text = `gantlo のレッスンで ${graded} 問中 ${graded} 問正解しました`;
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const page = await context.newPage();
    watch(page);
    await finishLesson(page);
    const x = page.getByRole('link', { name: /X に投稿する/ });
    const href = new URL(await x.getAttribute('href'));
    check(
      href.origin + href.pathname === 'https://x.com/intent/post' && href.searchParams.get('text') === text && href.searchParams.get('url') === `${SITE}lesson/${lesson.id}/`,
      `${tag} レッスン完了: X の投稿は点数の文とレッスンの URL だけ (${href.searchParams.get('text')} · ${href.searchParams.get('url')})`,
    );
    check((await x.getAttribute('target')) === '_blank', `${tag} X の投稿は新しいタブで開く`);
    const copy = page.getByRole('button', { name: 'リンクをコピー' });
    for (const [loc, label] of [
      [copy, 'リンクをコピー'],
      [x, 'X に投稿する'],
    ]) {
      const box = await loc.boundingBox();
      check(box !== null && box.height >= MIN_TARGET - 0.5, `${tag} 390 幅で「${label}」の押せる高さが ${MIN_TARGET}px 以上 (${box ? Math.round(box.height) : '見えない'})`);
    }
    await copy.click();
    await page.getByText('ページの URL をコピーしました').waitFor();
    check((await page.evaluate(() => navigator.clipboard.readText())) === `${SITE}lesson/${lesson.id}/`, `${tag} リンクをコピーでレッスンのページの URL がクリップボードに入る`);
    await noHorizontalOverflow(page, 390, `${tag} レッスン完了の共有`);
    await context.close();
  }

  // 3. Web Share API のある端末
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (d) => void window.__shared.push(d);
    });
    const page = await context.newPage();
    watch(page);
    await finishLesson(page);
    check((await page.getByRole('link', { name: /X に投稿する/ }).count()) === 0, `${tag} Web Share API のある端末では X の投稿とコピーを出さない`);
    await page.getByRole('button', { name: '共有する' }).click();
    await page.waitForFunction(() => window.__shared.length > 0);
    const shared = await page.evaluate(() => window.__shared[0]);
    check(JSON.stringify(shared) === JSON.stringify({ text, url: `${SITE}lesson/${lesson.id}/` }), `${tag} navigator.share に文と URL だけを渡す (${JSON.stringify(shared)})`);

    // 4. 模擬試験の結果 (時間切れ)
    await context.clock.install();
    await page.goto(`${base}exam/`);
    await page.getByRole('button', { name: '模擬試験を始める' }).click();
    await page.locator('[data-testid="exam-run"]').waitFor();
    await context.clock.fastForward('01:01:00');
    await page.getByTestId('share').waitFor();
    // 読み直しで差し替えの記録は空に戻る。時計を入れたあとは、ページの中のタイマーで待たない (node の側で見る)
    await page.getByRole('button', { name: '共有する' }).click();
    let exam;
    for (let i = 0; i < 50 && !exam; i++) {
      exam = await page.evaluate(() => window.__shared[0]);
      if (!exam) await new Promise((r) => setTimeout(r, 100));
    }
    check(JSON.stringify(exam) === JSON.stringify({ text: 'gantlo の模擬試験で 40 問中 0 問正解しました (0%)', url: `${SITE}exam/` }), `${tag} 模擬試験の結果の共有は点数と模擬試験の URL だけ (${JSON.stringify(exam)})`);
    await context.close();
  }

  check(outside.length === 0, `${tag} サイトの外へ何も送らない ${outside.join(' ')}`);
  check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
}
