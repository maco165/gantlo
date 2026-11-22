// 390 幅の崩れの検査 (B-025)。scripts/e2e.mjs (npm run e2e) から呼ぶ。スマホ (390 幅) と PC (1280 幅) のそれぞれで次を確かめる:
//   1. レッスンの応答の出典 (X-Source) の外部リンクは、長い URL でも箱と外部リンクの印 (svg) の右端が応答の枠と画面の内にある。
//      どのレッスンのどの問題で見るかは問題データから選ぶ (いちばん長い出典を持つ問題)
//   2. 用語集の「出てくるレッスン」と「出典」の区切り (・) が 1 行を占めず、前か後ろのリンクと同じ行に出る。
//      区切りの字の縦の中心が、前か後ろのリンクの箱の上端と下端の間にあることで見る (区切りの作りに依らない)
import { answer, loadLessons, startLesson } from './e2e-lessons.mjs';

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

    // 2. 用語集の区切り
    await page.goto(`${base}glossary/`);
    await page.locator('article.gloss').first().waitFor();
    const seps = await page.evaluate(() => {
      const out = [];
      for (const p of document.querySelectorAll('article.gloss .gloss__meta')) {
        const links = [...p.querySelectorAll('a')];
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.parentElement.closest('a')) continue;
          const at = n.textContent.indexOf('・');
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(n, at);
          range.setEnd(n, at + 1);
          const r = range.getBoundingClientRect();
          const mid = (r.top + r.bottom) / 2;
          // 区切りの前と後ろのリンク (文書の順で)
          const before = links.filter((a) => a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
          const after = links.find((a) => a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING);
          const within = (a) => {
            if (!a) return false;
            const b = a.getBoundingClientRect();
            return mid >= b.top && mid <= b.bottom;
          };
          out.push({ term: p.closest('article').dataset.term, ok: within(before) || within(after), mid: Math.round(mid) });
        }
      }
      return out;
    });
    const alone = seps.filter((s) => !s.ok);
    check(seps.length > 0 && alone.length === 0, `${tag} 用語集の区切り ${seps.length} 個が 1 行を占めず、前か後ろのリンクと同じ行に出る ${alone.map((s) => `${s.term}@${s.mid}`).join(' / ')}`);
    await noHorizontalOverflow(page, width, `${tag} 用語集`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
