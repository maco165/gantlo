// メニューの下端の「このサイト」の 2 つ・上の帯の GitHub のボタン・このサイトについての画面の、ブラウザでの通しの検査 (B-023)。
// scripts/e2e.mjs (npm run e2e) から呼ぶ。スマホ (390 幅) と PC (1280 幅) のそれぞれで、ホーム・計画・レッスン・用語集・404・
// このサイトについての画面について次を確かめる:
//   1. メニュー (PC は左の SideNav、スマホは左から開く引き出し) の下端に「このサイトについて」と「GitHub のリポジトリ」が出る。
//      下端とは、2 つが一覧のどの項目 (コースの最後の行) よりも下にあり、画面の下の端から 120px 以内に見えていること。
//      スマホでは押せる範囲が 44px 以上
//   2. 上の帯の右端 (右の端から 24px 以内) に GitHub のボタンがあり、リポジトリを新しいタブで開く。スマホでは 44px 以上
//   3. メニューの「このサイトについて」を押すと /gantlo/about/ が開き、200 OK・題・ソースコードと Issue のボタンが出て、
//      メニューの項目が選ばれた印 (aria-current) になる。直に開いても同じ
//   4. メニューのコースに「準備中」が付かない (どのコースにもレッスンがある)
//   5. 横にはみ出さず、文が切れない。ページのエラーが無い
import { loadLessons } from './e2e-lessons.mjs';

const MIN_TARGET = 44;
/** レッスンの画面を見るのに使う、問題データの最初のレッスン */
const LESSON = loadLessons()[0];
const REPO_URL = 'https://github.com/maco165/gantlo';
/** 下端とみなす、画面の下の端からの距離 */
const NEAR_BOTTOM = 120;
/** 右端とみなす、画面の右の端からの距離 */
const NEAR_END = 24;

export async function runAbout(browser, { base, check, noHorizontalOverflow }) {
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} このサイト]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const size = (b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '見えない');
    const target = async (locator, label) => {
      if (!phone) return;
      const b = await locator.boundingBox();
      check(b !== null && b.height >= MIN_TARGET && b.width >= MIN_TARGET, `${tag} ${label}: 押せる範囲が ${MIN_TARGET}px 以上 (${size(b)})`);
    };

    /** 今のメニューの入れ物 (スマホは開いた引き出し、PC は左の SideNav) */
    const openMenu = async () => {
      if (!phone) return page.locator('nav.astryx-side-nav');
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
      await page.waitForTimeout(400);
      return page.locator('dialog[open]');
    };
    const closeMenu = async () => {
      if (!phone) return;
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => ![...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
    };

    const screens = [
      ['ホーム', '', () => page.locator('.net__row').first().waitFor()],
      ['計画', 'plan/', () => page.locator('h1', { hasText: '計画' }).waitFor()],
      ['レッスン', `lesson/${LESSON.id}/`, () => page.getByRole('heading', { name: LESSON.questions[0].prompt }).waitFor()],
      ['用語集', 'glossary/', () => page.locator('article.gloss').first().waitFor()],
      ['404', 'no-such-page/', () => page.getByText('Not Found', { exact: true }).waitFor()],
      ['このサイトについて', 'about/', () => page.locator('h1', { hasText: 'このサイトについて' }).waitFor()],
    ];
    for (const [label, path, ready] of screens) {
      await page.goto(`${base}${path}`);
      await ready();
      const where = `${tag} ${label}`;

      // 2. 上の帯の右端の GitHub のボタン
      const repo = page.locator('header.mobile-bar').getByRole('link', { name: 'GitHub のリポジトリを開く' });
      const rb = (await repo.isVisible()) ? await repo.boundingBox() : null;
      check(rb !== null && rb.x + rb.width >= width - NEAR_END && rb.y < 80, `${where}: 上の帯の右端に GitHub のボタンがある (${rb ? `右端 ${Math.round(rb.x + rb.width)}/${width}・上 ${Math.round(rb.y)}` : '見えない'})`);
      check(
        rb !== null && (await repo.getAttribute('href')) === REPO_URL && (await repo.getAttribute('target')) === '_blank',
        `${where}: 上の帯の GitHub のボタンはリポジトリを新しいタブで開く`,
      );
      await target(repo, `${label} の上の帯の GitHub のボタン`);

      // 1. メニューの下端の 2 つ
      const menu = await openMenu();
      const about = menu.getByRole('link', { name: 'このサイトについて', exact: true });
      const gh = menu.getByRole('link', { name: 'GitHub のリポジトリ', exact: true });
      const lastCourse = menu.getByRole('link', { name: 'セキュリティ', exact: true });
      const [ab, gb, cb] = [await about.boundingBox(), await gh.boundingBox(), await lastCourse.boundingBox()];
      const bottomOk = ab !== null && gb !== null && cb !== null && ab.y >= cb.y + cb.height && gb.y >= ab.y && gb.y + gb.height <= height && gb.y + gb.height >= height - NEAR_BOTTOM;
      check(
        bottomOk && (await about.isVisible()) && (await gh.isVisible()),
        `${where}: メニューの下端に「このサイトについて」と「GitHub のリポジトリ」が出る (このサイト ${size(ab)}@${ab ? Math.round(ab.y) : '-'}・GitHub 下端 ${gb ? Math.round(gb.y + gb.height) : '-'}/${height}・最後のコース ${cb ? Math.round(cb.y) : '-'})`,
      );
      check((await gh.getAttribute('href')) === REPO_URL, `${where}: メニューの GitHub のリポジトリの行はリポジトリを指す`);
      await target(about, `${label} のメニューの「このサイトについて」`);
      await target(gh, `${label} のメニューの「GitHub のリポジトリ」`);
      if (label === 'ホーム') {
        // 4. コースに「準備中」が付かない
        const courses = await menu.getByRole('link', { name: /本編 4 週|Spring Boot の流れ|技術の歴史|管理の歴史|セキュリティ/ }).allInnerTexts();
        check(courses.length === 5 && courses.every((t) => !t.includes('準備中')), `${where}: メニューのコースに「準備中」が付かない (${courses.join(' / ')})`);
      }
      await closeMenu();
      await noHorizontalOverflow(page, width, where);
    }

    // 3. メニューから このサイトについて を開く
    await page.goto(base);
    await page.locator('.net__row').first().waitFor();
    const menu = await openMenu();
    await menu.getByRole('link', { name: 'このサイトについて', exact: true }).click();
    await page.locator('h1', { hasText: 'このサイトについて' }).waitFor();
    check(new URL(page.url()).pathname === '/gantlo/about/', `${tag} メニューの「このサイトについて」で /gantlo/about/ が開く (${new URL(page.url()).pathname})`);
    check((await page.title()) === 'このサイトについて | gantlo', `${tag} このサイトについての題 (${await page.title()})`);
    const main = page.locator('.page.about');
    check(await main.getByText('200', { exact: true }).isVisible(), `${tag} このサイトについては 200 OK`);
    const src = main.getByRole('link', { name: 'GitHub のリポジトリを開く' });
    const issue = main.getByRole('link', { name: 'Issue を書く' });
    check((await src.getAttribute('href')) === REPO_URL && (await issue.getAttribute('href')) === `${REPO_URL}/issues/new`, `${tag} ソースコードと Issue のボタンがリポジトリを指す`);
    check(await main.getByText('gantlo.v1', { exact: false }).first().isVisible(), `${tag} 記録の置き場所 (gantlo.v1) を書いている`);
    await target(src, 'このサイトについての GitHub のボタン');
    await target(issue, 'このサイトについての Issue のボタン');
    const menu2 = await openMenu();
    check((await menu2.getByRole('link', { name: 'このサイトについて', exact: true }).getAttribute('aria-current')) !== null, `${tag} 開いたあと、メニューの「このサイトについて」が選ばれた印になる`);
    await closeMenu();
    await noHorizontalOverflow(page, width, `${tag} このサイトについて`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
