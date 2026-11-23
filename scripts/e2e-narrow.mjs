// 390 幅の崩れの検査 (B-025)。scripts/e2e.mjs (npm run e2e) から呼ぶ。スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる:
//   1. レッスンの応答の出典 (X-Source) の外部リンクは、長い URL でも箱と外部リンクの印 (svg) の右端が応答の枠と画面の内にある。
//      どのレッスンのどの問題で見るかは問題データから選ぶ (いちばん長い出典を持つ問題)
//   2. 用語集で札 (出てくるレッスンと出典) がいちばん多い語を開き、どの札も説明の箱と画面の右端の内に収まる
import { readFileSync } from 'node:fs';
import { answer, loadLessons, startLesson } from './e2e-lessons.mjs';

const glossary = JSON.parse(readFileSync(new URL('../src/content/glossary.json', import.meta.url), 'utf8'));

/** いちばん長い出典を持つ問題と、その前の問題の数 */
function longestSource(lessons) {
  let best = null;
  for (const lesson of lessons) {
    lesson.questions.forEach((q, index) => {
      for (const s of q.sources ?? []) if (!best || s.length > best.url.length) best = { lesson, index, url: s };
    });
  }
  if (!best) throw new Error('問題データに出典を持つ問題がありません');
  return best;
}

export async function runNarrow(browser, { base, check, noHorizontalOverflow }) {
  const target = longestSource(loadLessons());
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} 崩れ]`;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1. 出典の外部リンクの印
    const { lesson, index, url } = target;
    await page.goto(`${base}lesson/${lesson.id}/`);
    await startLesson(page);
    for (let i = 0; i < index; i++) {
      await page.getByRole('heading', { name: lesson.questions[i].prompt }).waitFor();
      await answer(page, lesson.questions[i], 'right');
      await page.getByRole('button', { name: '次の問題へ' }).click();
    }
    const q = lesson.questions[index];
    await page.getByRole('heading', { name: q.prompt }).waitFor();
    await answer(page, q, 'right');
    const links = await page.evaluate(() => {
      const section = document.querySelector('section.response');
      const right = Math.min(section.getBoundingClientRect().right, document.documentElement.clientWidth);
      return [...section.querySelectorAll('a[target="_blank"]')].map((a) => {
        const icon = a.querySelector('svg')?.getBoundingClientRect();
        return { href: a.href, a: a.getBoundingClientRect().right, icon: icon ? icon.right : null, right };
      });
    });
    const longest = links.find((l) => l.href === url);
    check(longest !== undefined, `${tag} いちばん長い出典 (${url.length} 字) の応答を開いた (${lesson.id} の ${index + 1} 問目)`);
    const cut = links.filter((l) => l.icon === null || l.icon > l.right + 0.5 || l.a > l.right + 0.5);
    check(
      links.length > 0 && cut.length === 0,
      `${tag} 出典 ${links.length} 本の外部リンクの印が切れない (箱と印の右端が枠の内) ${cut.map((l) => `${l.href.slice(0, 40)}… 印 ${Math.round(l.icon ?? -1)}・箱 ${Math.round(l.a)} > ${Math.round(l.right)}`).join(' / ')}`,
    );
    await noHorizontalOverflow(page, width, `${tag} 長い出典の応答`);

    // 2. 用語集の札 (出てくるレッスンと出典)。札がいちばん多い語を開き、どの札も説明の箱と画面の内に収まる
    await page.goto(`${base}glossary/`);
    await page.locator('li.gloss-item').first().waitFor();
    const busiest = glossary.terms.reduce((x, t) => (t.lessons.length + t.sources.length > x.lessons.length + x.sources.length ? t : x));
    await page.locator(`li.gloss-item[data-term="${busiest.id}"] button`).click();
    await page.locator(`article.gloss[data-term="${busiest.id}"]`).waitFor();
    const chips = await page.evaluate((id) => {
      const box = document.querySelector(`article.gloss[data-term="${id}"]`);
      const right = Math.min(box.getBoundingClientRect().right, document.documentElement.clientWidth);
      return [...box.querySelectorAll('.gloss-chips a')].map((a) => ({ text: a.textContent, r: a.getBoundingClientRect().right, right }));
    }, busiest.id);
    const out = chips.filter((c) => c.r > c.right + 0.5);
    check(chips.length > 0 && out.length === 0, `${tag} 用語集の札 ${chips.length} 個 (${busiest.id}) が説明の箱と画面の内に収まる ${out.map((c) => `${c.text.slice(0, 20)} ${Math.round(c.r)} > ${Math.round(c.right)}`).join(' / ')}`);
    await noHorizontalOverflow(page, width, `${tag} 用語集`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
