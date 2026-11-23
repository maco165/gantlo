// ハンドブックの、ブラウザでの通しの検査 (B-028)。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる:
//   1. ホームからメニュー (PC は左の SideNav、スマホは左から開く引き出し) の「ハンドブック」を押すと /gantlo/handbook/ が開き、
//      200 OK と、目録 (src/content/handbook/topics.json) のすべての項目へのリンクが出る。メニューの項目が選ばれた印になる
//   2. 項目を押すと /gantlo/handbook/<id>/ が開き、本文のデータと同じ数の節があり、どの節にも出典の外部リンクがある
//   3. 項目の「用語集」のリンクから、用語集のその語の位置へ移る (URL の # が残り、語が画面の上半分に見える)
//      戻って進んでも語の位置へ送り、節の # 付きの URL (#s<番号>) を直に開くとその節の位置へ送る
//   4. 知らない項目 (/gantlo/handbook/no-such/) は 404
//   5. どの画面も横にはみ出さない。ページのエラーが無い
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../src/content/handbook/${p}`, import.meta.url), 'utf8'));

export async function runHandbook(browser, { base, check, noHorizontalOverflow }) {
  const topics = read('topics.json').topics;
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} ハンドブック]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1. メニューから一覧を開く
    await page.goto(base);
    await page.locator('.net__row').first().waitFor();
    if (phone) {
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
      await page.waitForTimeout(400);
    }
    const menu = phone ? page.locator('dialog[open]') : page.locator('nav.astryx-side-nav');
    await menu.getByRole('link', { name: 'ハンドブック' }).click();
    await page.locator('h1', { hasText: 'ハンドブック' }).waitFor();
    check(new URL(page.url()).pathname === `${new URL(base).pathname}handbook/`, `${tag} メニューから /handbook/ が開く (${page.url()})`);
    const status = await page.locator('.status__line').first().textContent();
    check(/200\s*OK/.test(status ?? ''), `${tag} 一覧は 200 OK (${status})`);
    if (!phone) {
      const selected = await page.locator('nav.astryx-side-nav').getByRole('link', { name: 'ハンドブック' }).getAttribute('aria-current');
      check(selected === 'page', `${tag} メニューのハンドブックが選ばれた印になる (aria-current=${selected})`);
    }
    for (const t of topics) check((await page.getByRole('link', { name: t.title }).count()) === 1, `${tag} 一覧に「${t.title}」へのリンクがある`);
    await noHorizontalOverflow(page, width, `${tag} 一覧`);

    // 2. 項目を開く
    for (const t of topics) {
      const sections = read(`sections/${t.id}.json`).sections;
      await page.goto(`${base}handbook/`);
      await page.getByRole('link', { name: t.title }).click();
      await page.locator('h1', { hasText: t.title }).waitFor();
      await page.locator('section.hb-section').first().waitFor();
      const shown = await page.locator('section.hb-section[id^="s"]').count();
      check(shown === sections.length, `${tag} ${t.id}: 節が ${sections.length} 個 (${shown})`);
      const noSource = await page.evaluate(() => [...document.querySelectorAll('section.hb-section[id^="s"]')].filter((s) => !s.querySelector('a[target="_blank"][href^="https://"]')).map((s) => s.id));
      check(noSource.length === 0, `${tag} ${t.id}: どの節にも出典の外部リンクがある ${noSource.join(',')}`);
      await noHorizontalOverflow(page, width, `${tag} ${t.id}`);

      // 3. 用語集へ
      // 一覧の先頭の語では移ったか分からないので、最後の語で見る
      const term = t.terms[t.terms.length - 1];
      await page.locator(`a[href$="glossary/#term-${term}"]`).first().click();
      await page.locator(`#term-${term}`).waitFor();
      check(new URL(page.url()).hash === `#term-${term}`, `${tag} ${t.id}: 用語集の ${term} の位置へ移る (${page.url()})`);
      await page.waitForTimeout(300);
      const top = (await page.locator(`#term-${term}`).boundingBox())?.y ?? -1;
      check(top >= 0 && top < height / 2, `${tag} ${t.id}: 用語集の ${term} が画面の上半分に見える (y=${Math.round(top)})`);

      // 戻って進んでも、語の位置へ送る
      await page.goBack();
      await page.locator('h1', { hasText: t.title }).waitFor();
      await page.goForward();
      await page.locator(`#term-${term}`).waitFor();
      await page.waitForTimeout(300);
      const again = (await page.locator(`#term-${term}`).boundingBox())?.y ?? -1;
      check(again >= 0 && again < height / 2, `${tag} ${t.id}: 戻って進んでも ${term} が画面の上半分に見える (y=${Math.round(again)})`);

      // 節の # 付きの URL を直に開くと、その節の位置へ送る (最後の節で見る)
      const last = `s${sections.length}`;
      await page.goto(`${base}handbook/${t.id}/#${last}`);
      await page.locator(`#${last}`).waitFor();
      await page.waitForTimeout(300);
      const sy = (await page.locator(`#${last}`).boundingBox())?.y ?? -1;
      check(sy >= 0 && sy < height / 2, `${tag} ${t.id}: #${last} を直に開くと、その節が画面の上半分に見える (y=${Math.round(sy)})`);
    }

    // 4. 知らない項目
    await page.goto(`${base}handbook/no-such/`);
    await page.locator('.status__line').first().waitFor();
    const nf = await page.locator('.status__line').first().textContent();
    check(/404/.test(nf ?? ''), `${tag} 知らない項目は 404 (${nf})`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
