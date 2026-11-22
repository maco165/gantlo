// レッスンの要点 (intro) と、穴埋めの誤答ごとの説明の検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。
//   1. はじめてのレッスンは、問題の前に要点 (分かるようになること 3 行・説明・図・試すコマンド・出典) が出て、
//      「問題を始める」で 1 問目へ進む。始めたあとは要点が畳まれて問題の上にあり、開けば読める (checkIntroGate。通しの検査の始めに呼ぶ)
//   2. 済みのレッスンを開き直すと、要点を飛ばして 1 問目が出る。要点は畳んである
//   3. 穴埋めで、よくある誤答 (blanks[].wrong) を入れると、その答えと「なぜ違うか」が解説の前に出る。
//      登録の無い誤りでは出ない (今まで通り)
//   4. 復習では要点を出さない
//   5. 390 幅で、要点の画面 (図・試すコマンド・出典) が横にはみ出さない
// 使うレッスンと問題は問題データから選ぶ (図とコマンドを持つ要点・誤答を持つ穴埋め)。
import { INTRO_START, answer, fill, loadLessons, startLesson } from './e2e-lessons.mjs';

const GOALS_HEADING = 'このレッスンで分かるようになること';
const SUMMARY = '要点を読む';

/**
 * はじめて開いたレッスンの要点を確かめて「問題を始める」を押す。押したあと、1 問目と畳んだ要点が出る
 */
export async function checkIntroGate(page, lesson, tag, width, { check, noHorizontalOverflow }) {
  const intro = lesson.intro;
  const gate = page.getByTestId('lesson-intro');
  await gate.waitFor();
  check(await page.getByRole('heading', { level: 2, name: '要点' }).isVisible(), `${tag} はじめてのレッスンは、問題の前に要点の見出し (h2) が出る`);
  check((await page.getByRole('heading', { name: lesson.questions[0].prompt }).count()) === 0, `${tag} 要点を読む間は 1 問目を出さない`);
  const text = await gate.innerText();
  const missing = [GOALS_HEADING, ...intro.goals, ...intro.body, intro.figure?.caption, ...(intro.tryIt ?? []).map((t) => t.command)].filter((x) => x && !text.replace(/\s+/g, ' ').includes(x.replace(/\s+/g, ' ')));
  check(missing.length === 0, `${tag} 要点に分かるようになること 3 行・説明・図・試すコマンドが出る ${missing.join(' / ')}`);
  const links = await gate.locator('a[href^="https://"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(JSON.stringify(links) === JSON.stringify(intro.sources), `${tag} 要点の出典がリンクで出る (${links.length} / ${intro.sources.length})`);
  if (noHorizontalOverflow) await noHorizontalOverflow(page, width, `${tag} 要点`);
  await page.getByRole('button', { name: INTRO_START }).click();
  await page.getByRole('heading', { name: lesson.questions[0].prompt }).waitFor();
  const folded = page.getByTestId('lesson-intro-folded');
  check((await gate.count()) === 0 && (await folded.getAttribute('open')) === null, `${tag} 「問題を始める」で 1 問目が出て、要点は畳まれる`);
  await folded.locator('summary', { hasText: SUMMARY }).click();
  check(await folded.getByText(intro.goals[0]).isVisible(), `${tag} 畳んだ要点は開けば読める`);
  // 見出しの段を飛ばさない: レッスンの画面の見出しを上から並べ、h1 の次は h2 まで、前の段 +1 を超えない
  const levels = await page.locator('.lesson').evaluate((el) => [...el.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => h.offsetParent !== null).map((h) => Number(h.tagName[1])));
  const jump = levels.findIndex((lv, k) => (k === 0 ? lv !== 1 : lv > levels[k - 1] + 1));
  check(levels.length > 2 && jump < 0, `${tag} 畳んだ要点を開いても、見出しの段を飛ばさない (h${levels.join(' → h')})`);
  await folded.locator('summary').click();
}

/** 誤答を持つ穴埋めのうち、誤答がメディアタイプの空欄でないもの (415 でなく 400 で返る) */
function pickWrongTarget(lessons) {
  for (const lesson of lessons)
    for (const [index, q] of lesson.questions.entries()) {
      if (q.kind !== 'command' && q.kind !== 'http') continue;
      const bi = q.blanks.findIndex((b) => b.wrong?.length && b.match !== 'media-type');
      if (bi >= 0) return { lesson, index, q, bi };
    }
  throw new Error('問題データに、よくある誤答を持つ穴埋めがありません');
}

export async function runIntro(browser, { base, check, noHorizontalOverflow }) {
  const lessons = loadLessons();
  // 図とコマンドの両方を持つ要点のうち、いちばん長いもの (はみ出しを見るため)
  const withAll = lessons.filter((l) => l.intro?.figure && l.intro?.tryIt?.length);
  const big = withAll.sort((a, b) => JSON.stringify(b.intro).length - JSON.stringify(a.intro).length)[0];
  const target = pickWrongTarget(lessons);
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} 要点]`;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1・5. いちばん長い要点 (表か流れの図・試すコマンド) を開き、はみ出さずに読めて、始められる
    await page.goto(`${base}lesson/${big.id}/`);
    await checkIntroGate(page, big, `${tag} ${big.id}`, width, { check, noHorizontalOverflow });

    // 3. 誤答の説明: 誤答を持つ穴埋めまで進み、登録した誤答を入れる
    const { lesson, index, q, bi } = target;
    await page.goto(`${base}lesson/${lesson.id}/`);
    await startLesson(page);
    for (let i = 0; i < index; i++) {
      await page.getByRole('heading', { name: lesson.questions[i].prompt }).waitFor();
      await answer(page, lesson.questions[i], 'right');
      await page.getByRole('button', { name: '次の問題へ' }).click();
    }
    await page.getByRole('heading', { name: q.prompt }).waitFor();
    const w = q.blanks[bi].wrong[0];
    const right = q.blanks.map((b) => b.answers[0]);
    await fill(
      page,
      q.blanks.map((_, i) => (i === bi ? w.answer : right[i])),
    );
    await page.getByRole('button', { name: 'POST 答えを送る' }).click();
    const note = page.getByTestId('wrong-note');
    await page.locator('section.response[data-status]').waitFor();
    const noteText = (await note.allInnerTexts()).join('\n');
    check((await note.count()) === 1 && noteText.includes(w.answer) && noteText.includes(w.why), `${tag} ${q.id}: よくある誤答 (${w.answer}) を入れると、その答えとなぜ違うかが出る`);
    check(await page.locator('section.response').getByText(q.explanation).isVisible(), `${tag} ${q.id}: 誤答の説明と一緒に全体の解説も出る`);
    const order = await page.locator('section.response .response__body').evaluate((el, why) => {
      const t = el.textContent ?? '';
      return t.indexOf(why);
    }, w.why);
    check(order >= 0, `${tag} ${q.id}: 誤答の説明は応答の本文に出る`);
    if (noHorizontalOverflow) await noHorizontalOverflow(page, width, `${tag} 誤答の説明`);

    // 登録の無い誤りでは出ない: 同じ問題を「もう一度」は手間なので、レッスンを開き直して zz-wrong-answer で答える
    await page.goto(`${base}lesson/${lesson.id}/`);
    await startLesson(page);
    for (let i = 0; i < index; i++) {
      await page.getByRole('heading', { name: lesson.questions[i].prompt }).waitFor();
      await answer(page, lesson.questions[i], 'right');
      await page.getByRole('button', { name: '次の問題へ' }).click();
    }
    await page.getByRole('heading', { name: q.prompt }).waitFor();
    await answer(page, q, 'wrong');
    check((await page.getByTestId('wrong-note').count()) === 0, `${tag} ${q.id}: 登録の無い誤りでは、誤答の説明を出さない (正しい答えと解説だけ)`);

    // 2. 済みのレッスン: 記録に済みを入れて開き直すと、要点を飛ばして 1 問目が出る
    await page.evaluate((id) => {
      const key = 'gantlo.v1';
      const p = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!p) throw new Error('進捗がありません');
      p.lessons[id] = { done: true, best: 1, at: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(p));
    }, big.id);
    await page.goto(`${base}lesson/${big.id}/`);
    await page.getByRole('heading', { name: big.questions[0].prompt }).waitFor();
    const folded = page.getByTestId('lesson-intro-folded');
    check((await page.getByTestId('lesson-intro').count()) === 0 && (await folded.count()) === 1 && (await folded.getAttribute('open')) === null, `${tag} 済みのレッスンは要点を飛ばして 1 問目を出し、要点は畳む`);

    // 4. 復習: 上で間違えた問題 (q) の復習の予定を今日にして、復習を始める。要点は出ない
    await page.evaluate((qid) => {
      const key = 'gantlo.v1';
      const p = JSON.parse(localStorage.getItem(key));
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      p.answers[qid] = { ...p.answers[qid], stage: 0, nextReview: today };
      localStorage.setItem(key, JSON.stringify(p));
    }, q.id);
    await page.goto(`${base}review/`);
    await page.getByRole('button', { name: '復習を始める' }).click();
    await page.locator('.lesson-bar').waitFor();
    check((await page.getByTestId('lesson-intro').count()) === 0 && (await page.getByTestId('lesson-intro-folded').count()) === 0, `${tag} 復習では要点を出さない`);

    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
