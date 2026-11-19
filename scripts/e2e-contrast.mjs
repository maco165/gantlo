// テーマと文字のコントラストの、ブラウザでの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
// 390 幅と 1280 幅で、主な画面 (ホーム・計画・復習・レッスンの問題と応答 400 / 200 / 409・完了 201・404・設定と記録を消す確かめ) を開き、次を確かめる:
//   - テーマが Gothic で読み込まれている (地の token --color-background-body が #101314 で、body の地がその色)
//   - 文字を持つ見える要素 (本文・補助の文字・ボタン・リンク・ステータスのコード・入力欄) のどれも、文字の色と実際の地の色
//     (根から要素まで地を塗り重ね、opacity の祖先は字と地の両方を奥の地に重ねる) のコントラスト比が 4.5:1 以上。大きな文字の 3:1 の例外は使わない
//   - 押せないボタン (disabled・aria-disabled) は WCAG 1.4.3 の対象外なので数えない。空の入力欄は placeholder の字と色を測る
//   - 390 幅でスマホのメニューを開いた状態も測る (開いたモーダルの外は操作できないので、モーダルの中だけを測る)
//   - 測り方の確かめ: opacity の群 (祖先の opacity も含む) を地と字の両方に重ねて測れること (合成のページで約 3.98:1 になる)
import { answer, coverLessons, hasKind, isPlainFill, loadLessons, pickWalkLesson } from './e2e-lessons.mjs';

/** WCAG 1.4.3 の最小のコントラスト比。大きな文字の例外 (3:1) は使わない */
export const MIN_CONTRAST = 4.5;
/** Gothic のテーマの地の色 (@astryxdesign/theme-gothic の theme.css の --color-background-body) */
export const GOTHIC_BODY = 'rgb(16, 19, 20)';

// 測るレッスンは問題データから選ぶ (並べ替え・4 択・穴埋めを持つもの。実習が無ければ実習を持つレッスンも足す)
const LESSONS = loadLessons();
const walkLesson = pickWalkLesson(LESSONS);
const lessonsToMeasure = [walkLesson, ...coverLessons(LESSONS, hasKind(walkLesson, 'lab') ? {} : { 実習: (l) => hasKind(l, 'lab') })];

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

  // a と b を t : (1 - t) で混ぜた色 (opacity の群を、その奥の地の上に重ねる)
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t)).concat(1);

  /**
   * 画面に見えている字の色と地の色を、根 (html) から要素まで順に塗って求める。
   * 各段で自分の地 (半透明なら奥の地に重ねる) を塗り、opacity が 1 未満の段は、その段より内側に塗った字と地の両方を
   * その段より奥の地の上に opacity で重ねる (opacity の群)。不透明な地があっても、opacity を持つ祖先まで全部たどる。
   * 画像の地 (グラデーションなど) は測れないので印を付ける
   */
  const composite = (el, fg) => {
    const path = [];
    for (let e = el; e; e = e.parentElement) path.unshift(e);
    let image = false;
    const paint = (i, under) => {
      const cs = getComputedStyle(path[i]);
      if (cs.backgroundImage !== 'none') image = true;
      const own = parse(cs.backgroundColor);
      const bgHere = own && own[3] > 0 ? over(own, under) : under;
      const inner = i === path.length - 1 ? { bg: bgHere, fg: over(fg, bgHere) } : paint(i + 1, bgHere);
      const op = Number(cs.opacity);
      return op < 1 ? { bg: mix(inner.bg, under, op), fg: mix(inner.fg, under, op) } : inner;
    };
    const r = paint(0, [255, 255, 255, 1]); // どこにも地が無ければブラウザの既定 (白)
    return { ...r, image };
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false; // 読み上げにだけ伝える文 (1px に縮めたもの) は見えない
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
  };
  const inactive = (el) => el.closest(':disabled, [aria-disabled="true"], [inert]') !== null;

  const out = [];
  // 開いたモーダル (スマホのメニューの引き出しなど) があれば、その外は見えても操作できない (inert) ので、中だけを測る
  const modal = [...document.querySelectorAll('dialog[open]')].find((d) => d.matches(':modal')) ?? null;
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'path', 'TITLE'].includes(el.tagName)) return false;
    if (el.closest('svg, dialog:not([open])')) return false;
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== '');
    const field = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'checkbox' && el.type !== 'radio' && (el.value !== '' || el.placeholder !== '');
    return (own || field) && visible(el) && !inactive(el) && (modal === null || modal.contains(el));
  });
  for (const el of els) {
    const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    // 空の入力欄は placeholder の字を、その色 (::placeholder) で測る
    const usePlaceholder = isField && el.value === '';
    const color = getComputedStyle(el, usePlaceholder ? '::placeholder' : null).color;
    const fg = parse(color);
    const text = (isField ? (usePlaceholder ? el.placeholder : el.value) : el.textContent).trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!fg) {
      out.push({ text, ratio: 0, fg: color, bg: '', note: '文字の色が読めない' });
      continue;
    }
    const shown = composite(el, fg);
    out.push({ text, ratio: ratio(shown.fg, shown.bg), fg: hex(shown.fg), bg: hex(shown.bg), note: shown.image ? '地に画像あり' : usePlaceholder ? 'placeholder' : '' });
  }
  return out;
}

/**
 * 今の画面のコントラストを測り、4.5:1 に届かない文字を挙げて check する。測った中で最小の比を返す。
 * must に挙げた文字 (ステータスのコード・ボタンの字など) が測った中にあることも確かめる (測り漏れで通らないように)
 */
export async function checkContrast(page, check, label, must = []) {
  const rows = await page.evaluate(measureInPage);
  if (must.length > 0) {
    const missing = must.filter((t) => !rows.some((r) => r.text === t));
    check(missing.length === 0, `${label}: 測った文字に ${must.join('・')} が入っている ${missing.join(' / ')}`);
  }
  const low = rows.filter((r) => r.ratio < MIN_CONTRAST || r.note === '地に画像あり');
  const min = rows.reduce((m, r) => (r.ratio < m.ratio ? r : m), { ratio: Infinity, text: '', fg: '', bg: '' });
  const ph = rows.filter((r) => r.note === 'placeholder').map((r) => `placeholder「${r.text}」${r.ratio.toFixed(2)}:1 ${r.fg}/${r.bg}`);
  check(
    rows.length > 0 && low.length === 0,
    `${label}: 文字と地のコントラストが ${MIN_CONTRAST}:1 以上 (${rows.length} 要素、最小 ${min.ratio.toFixed(2)}:1「${min.text}」${min.fg} / ${min.bg}${ph.length ? '、' + ph.join('、') : ''})${low.length ? ' 届かない: ' + low.map((r) => `「${r.text}」${r.ratio.toFixed(2)} ${r.fg}/${r.bg} ${r.note}`).join(' / ') : ''}`,
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
 * 測り方そのものの確かめ。白い地のページに、opacity 0.5 の黒い地・白い字の箱 (A) と、opacity 0.5 の外側の中の黒い地・白い字 (C) を置く。
 * どちらも見た目は #808080 の地に白い字 (約 3.98:1) なので、4.5:1 に届かないと測れること。opacity の無い箱 (OK) は 21:1
 */
async function checkOpacityGroups(browser, check) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#ffffff;color:#000000">
    <div style="opacity:0.5;background:#000000;color:#ffffff;padding:8px">A 白い字</div>
    <div style="opacity:0.5"><div style="background:#000000;color:#ffffff;padding:8px">C 白い字</div></div>
    <div style="background:#000000;color:#ffffff;padding:8px">OK 白い字</div>
  </body></html>`);
  const rows = await page.evaluate(measureInPage);
  const get = (t) => rows.find((r) => r.text === t)?.ratio ?? NaN;
  const [a, c, ok] = [get('A 白い字'), get('C 白い字'), get('OK 白い字')];
  const near = (x) => Math.abs(x - 3.98) < 0.05;
  check(near(a) && a < MIN_CONTRAST, `[contrast 測り方] opacity 0.5 の箱の中の白い字は、#808080 の地として約 3.98:1 と測る (A ${a.toFixed(2)}:1)`);
  check(near(c) && c < MIN_CONTRAST, `[contrast 測り方] opacity 0.5 の祖先の中の黒い地の白い字も、約 3.98:1 と測る (C ${c.toFixed(2)}:1)`);
  check(Math.abs(ok - 21) < 0.01, `[contrast 測り方] opacity の無い黒い地の白い字は 21:1 (${ok.toFixed(2)}:1)`);
  await page.close();
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ base: string, check: (cond: boolean, label: string) => void }} opts
 * @returns {Promise<{ label: string, ratio: number, text: string }[]>} 画面ごとの最小の比
 */
export async function runContrast(browser, { base, check }) {
  const mins = [];
  await checkOpacityGroups(browser, check);
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
    const next = () => page.getByRole('button', { name: /^(次の問題へ|POST 結果を記録する)$/ }).click();
    const response = (code) => page.locator(`section.response[data-status="${code}"]`).waitFor();

    await page.goto(base);
    await page.locator('.net__row').first().waitFor();
    await checkGothic(page, check, `${tag} ホーム`);
    await measure('ホーム', ['gantlo']);
    if (width < 768) {
      // スマホのメニュー (左から開く引き出し) を開いた状態
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
      await page.waitForTimeout(400);
      await measure('スマホのメニュー', ['計画 (Gantt)']);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => ![...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')));
    }

    await page.goto(`${base}plan/`);
    await page.locator('.gantt__row').first().waitFor();
    await measure('計画');

    // 復習 (今日の分が無いとき)
    await page.goto(`${base}review/`);
    await page.locator('h1', { hasText: '復習' }).waitFor();
    await measure('復習 (予定なし)');

    // レッスン: 問題 → 不正解 400 → 正解 200 → 並べ替えの 409 → 4 択 → 実習 → 完了 201。どの画面もそれぞれ最初の 1 回を測る
    const seen = new Set();
    const first = (key) => !seen.has(key) && seen.add(key);
    for (const lesson of lessonsToMeasure) {
      await page.goto(`${base}lesson/${lesson.id}/`);
      for (const q of lesson.questions) {
        await page.getByRole('heading', { name: q.prompt }).waitFor();
        if (isPlainFill(q) && first('400')) {
          // 値を入れる前は、空欄の placeholder (____) の字を測る
          await measure('レッスンの問題 (穴埋め・入力前)', ['____']);
          // 空欄を全部埋めるまで答えを送るボタンは押せない (押せないボタンは測らない) ので、全部に入れる
          for (const input of await page.locator('[data-testid="fill-code"] input').all()) await input.fill('-x');
          await measure('レッスンの問題 (穴埋め)', ['POST 答えを送る', '-x']);
          await answer(page, q, 'wrong');
          await response(400);
          await measure('応答 400', ['400', 'Bad Request', '次の問題へ']);
        } else if (q.kind === 'order' && first('409')) {
          await measure('レッスンの問題 (並べ替え)');
          await answer(page, q, 'unsorted');
          await response(409);
          await measure('応答 409 (並べ替えの帯)', ['409', 'Conflict']);
        } else if (q.kind === 'lab' && first('lab')) {
          for (const box of await page.getByRole('checkbox').all()) await box.check();
          await measure('レッスンの問題 (実習)');
          await page.getByRole('button', { name: 'POST 実習を終える' }).click();
          await response(200);
        } else {
          if (q.kind === 'choice' && first('choice')) await measure('レッスンの問題 (4 択)');
          await answer(page, q, 'right');
          await response(200);
          if (first('200')) await measure('応答 200', ['200', 'OK']);
        }
        await next();
      }
      await response(201);
      if (first('201')) await measure('完了 201', ['201', 'Created', 'もう一度解く', 'ホームへ戻る']);
    }
    check(['400', '409', 'lab', 'choice', '200', '201'].every((k) => seen.has(k)), `${tag} レッスンの画面を全部測った (${[...seen].join(',')})`);

    await page.goto(`${base}lesson/no-such-lesson/`);
    await page.getByText('Not Found', { exact: true }).waitFor();
    await measure('404', ['404', 'Not Found']);

    // 復習 (今日の分があるとき): レッスンで間違えた問題の予定を今日 (手元の日付) にする
    await page.evaluate(() => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const p = JSON.parse(localStorage.getItem('gantlo.v1') ?? '{}');
      for (const a of Object.values(p.answers ?? {})) if (a.wrong > 0) a.nextReview = today;
      localStorage.setItem('gantlo.v1', JSON.stringify(p));
    });
    await page.goto(`${base}review/`);
    await page.getByRole('button', { name: '復習を始める' }).waitFor();
    await measure('復習 (今日の分あり)', ['復習を始める']);

    // 設定と、記録を消す前の確かめ (画面の中の dialog)
    await page.goto(`${base}settings/`);
    await page.getByRole('button', { name: 'DELETE 記録を消す' }).waitFor();
    await measure('設定', ['DELETE 記録を消す', 'GET 記録を書き出す (JSON)']);
    await page.getByRole('button', { name: 'DELETE 記録を消す' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await page.waitForTimeout(400);
    await measure('設定 (記録を消す確かめ)', ['記録を消しますか?', '消す', 'やめる']);
    await dialog.getByRole('button', { name: 'やめる' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await context.close();
  }
  return mins;
}
