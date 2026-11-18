// テーマと文字のコントラストの、ブラウザでの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 390 幅と 1280 幅で、主な画面 (ホーム・計画・レッスンの問題と応答 400 / 200 / 409・完了 201・404) を開き、次を確かめる:
//   - テーマが Gothic で読み込まれている (地の token --color-background-body が #101314 で、body の地がその色)
//   - 文字を持つ見える要素 (本文・補助の文字・ボタン・リンク・ステータスのコード・入力欄) のどれも、文字の色と実際の地の色
//     (透明なら親をたどって重ねる) のコントラスト比が 4.5:1 以上。大きな文字の 3:1 の例外は使わない
//   - 押せないボタン (disabled・aria-disabled) は WCAG 1.4.3 の対象外なので数えない
import { readFileSync } from 'node:fs';

/** WCAG 1.4.3 の最小のコントラスト比。大きな文字の例外 (3:1) は使わない */
export const MIN_CONTRAST = 4.5;
/** Gothic のテーマの地の色 (@astryxdesign/theme-gothic の theme.css の --color-background-body) */
export const GOTHIC_BODY = 'rgb(16, 19, 20)';

const week1 = JSON.parse(readFileSync(new URL('../src/content/courses/main/week1.json', import.meta.url), 'utf8'));
const lesson = week1.lessons.find((l) => l.id === 'main-w1-l1');

/**
 * 画面の中の文字を持つ要素ごとに、文字の色・地の色・コントラスト比を測る (ブラウザの中で動く)。
 * 地は要素から上へたどり、半透明の地を下から順に重ねる。たどり着く前に地が不透明になれば、そこで止める
 */
function measureInPage() {
  const parse = (c) => {
    let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    m = c.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])];
    return null;
  };
  // 上に a (透明度つき) を、下に b (不透明) を重ねた色
  const over = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  /** 要素の地。透明なら親へ進み、半透明の地は集めて最後に下から重ねる。画像の地 (グラデーションなど) は測れないので印を付ける */
  const background = (el) => {
    const layers = [];
    let opacity = 1;
    let image = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      opacity *= Number(cs.opacity);
      if (cs.backgroundImage !== 'none') image = true;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let bg = [255, 255, 255, 1]; // どこにも地が無ければブラウザの既定 (白)
    for (const l of layers.reverse()) bg = l[3] >= 1 ? l : over(l, bg);
    return { bg, opacity, image };
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false; // 読み上げにだけ伝える文 (1px に縮めたもの) は見えない
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
  };
  const inactive = (el) => el.closest(':disabled, [aria-disabled="true"], [inert]') !== null;

  const out = [];
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'path', 'TITLE'].includes(el.tagName)) return false;
    if (el.closest('svg, dialog:not([open])')) return false;
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== '');
    const field = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'checkbox' && el.type !== 'radio' && el.value !== '';
    return (own || field) && visible(el) && !inactive(el);
  });
  for (const el of els) {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const { bg, opacity, image } = background(el);
    const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.value : el.textContent).trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!fg) {
      out.push({ text, ratio: 0, fg: cs.color, bg: hex(bg), note: '文字の色が読めない' });
      continue;
    }
    // 文字の色の透明度と、要素や親の opacity を地の上に重ねてから比べる
    const shown = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    out.push({ text, ratio: ratio(shown, bg), fg: hex(shown), bg: hex(bg), note: image ? '地に画像あり' : '' });
  }
  return out;
}

/**
 * 今の画面のコントラストを測り、4.5:1 に届かない文字を挙げて check する。測った中で最小の比を返す。
 * must に挙げた文字 (ステータスのコード・ボタンの字など) が測った中にあることも確かめる (測り漏れで通らないように)
 */
export async function checkContrast(page, check, label, must = []) {
  const rows = await page.evaluate(measureInPage);
  const missing = must.filter((t) => !rows.some((r) => r.text === t));
  check(missing.length === 0, `${label}: 測った文字に ${must.join('・')} が入っている ${missing.join(' / ')}`);
  const low = rows.filter((r) => r.ratio < MIN_CONTRAST || r.note === '地に画像あり');
  const min = rows.reduce((m, r) => (r.ratio < m.ratio ? r : m), { ratio: Infinity, text: '', fg: '', bg: '' });
  check(
    rows.length > 0 && low.length === 0,
    `${label}: 文字と地のコントラストが ${MIN_CONTRAST}:1 以上 (${rows.length} 要素、最小 ${min.ratio.toFixed(2)}:1「${min.text}」${min.fg} / ${min.bg})${low.length ? ' 届かない: ' + low.map((r) => `「${r.text}」${r.ratio.toFixed(2)} ${r.fg}/${r.bg} ${r.note}`).join(' / ') : ''}`,
  );
  return min;
}

/** テーマが Gothic で読み込まれているか (地の token と body の地) */
async function checkGothic(page, check, label) {
  const got = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-background-body)';
    (document.querySelector('.astryx-app-shell') ?? document.body).append(probe);
    const token = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { token, body: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme };
  });
  check(got.token === GOTHIC_BODY && got.body === GOTHIC_BODY, `${label}: テーマが Gothic (地の token と body の地が #101314。token ${got.token}・body ${got.body}・color-scheme ${got.scheme})`);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ base: string, check: (cond: boolean, label: string) => void }} opts
 * @returns {Promise<{ label: string, ratio: number, text: string }[]>} 画面ごとの最小の比
 */
export async function runContrast(browser, { base, check }) {
  const mins = [];
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[contrast ${name}]`;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const measure = async (screen, must = []) => {
      // 字 (Google Fonts) の読み込みと画面の動きが落ち着いてから測る
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const min = await checkContrast(page, check, `${tag} ${screen}`, must);
      mins.push({ label: `${name} ${screen}`, ratio: min.ratio, text: min.text });
    };
    const send = () => page.getByRole('button', { name: 'POST 答えを送る' }).click();
    const next = () => page.getByRole('button', { name: /^(次の問題へ|POST 結果を記録する)$/ }).click();
    const response = (code) => page.locator(`section.response[data-status="${code}"]`).waitFor();

    await page.goto(base);
    await page.locator('.net__row').first().waitFor();
    await checkGothic(page, check, `${tag} ホーム`);
    await measure('ホーム', ['gantlo']);

    await page.goto(`${base}plan/`);
    await page.locator('.gantt__row').first().waitFor();
    await measure('計画');

    // レッスン: 問題 → 不正解 400 → 正解 200 → 並べ替えの 409 → 4 択 → 実習 → 完了 201
    const [qCmd, qHttp, qOrder, qChoice] = lesson.questions;
    await page.goto(`${base}lesson/${lesson.id}/`);
    await page.getByRole('heading', { name: qCmd.prompt }).waitFor();
    await page.locator('[data-testid="fill-code"] input').first().fill('-x');
    await measure('レッスンの問題 (穴埋め)', ['POST 答えを送る', '-x']);
    await send();
    await response(400);
    await measure('応答 400', ['400', 'Bad Request', '次の問題へ']);
    await next();
    await page.getByRole('heading', { name: qHttp.prompt }).waitFor();
    const inputs = page.locator('[data-testid="fill-code"] input');
    for (const [i, b] of qHttp.blanks.entries()) await inputs.nth(i).fill(b.answers[0]);
    await send();
    await response(200);
    await measure('応答 200', ['200', 'OK']);
    await next();
    await page.getByRole('heading', { name: qOrder.prompt }).waitFor();
    await measure('レッスンの問題 (並べ替え)');
    await send();
    await response(409);
    await measure('応答 409 (並べ替えの帯)', ['409', 'Conflict']);
    await next();
    await page.getByRole('heading', { name: qChoice.prompt }).waitFor();
    await measure('レッスンの問題 (4 択)');
    await page.getByRole('radio').first().check();
    await send();
    await page.locator('section.response[data-status]').first().waitFor();
    await next();
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await measure('レッスンの問題 (実習)');
    await page.getByRole('button', { name: 'POST 実習を終える' }).click();
    await response(200);
    await next();
    await response(201);
    await measure('完了 201', ['201', 'Created', 'もう一度解く', 'ホームへ戻る']);

    await page.goto(`${base}lesson/no-such-lesson/`);
    await page.getByText('Not Found', { exact: true }).waitFor();
    await measure('404', ['404', 'Not Found']);
    await context.close();
  }
  return mins;
}
