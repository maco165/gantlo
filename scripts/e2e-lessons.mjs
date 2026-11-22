// e2e の検査が使う、問題データの読み方と、問題の答え方。scripts/e2e*.mjs から読む。
// 検査は本物の問題データの中身 (何問目が何の種類か・XP の合計など) を決め打ちせず、ここでデータから探して数える。
import { readFileSync, readdirSync } from 'node:fs';

/** 1 問正解ごとの XP と、実習を終えたときの XP (src/lib/grade.ts の XP_PER_CORRECT・XP_PER_LAB と同じ) */
export const XP_PER_CORRECT = 3;
export const XP_PER_LAB = 10;

const COURSES_DIR = new URL('../src/content/courses/', import.meta.url);
// 本編 → 追加のコース (src/lib/route.ts の COURSES と同じ順)。計画が無いときのホームの順
export const COURSE_ORDER = ['main', 'spring', 'tech-history', 'mgmt-history', 'security'];

/** 問題データを、ホームと同じ順 (コースの順 → ファイル名の順 → ファイルの中の順) に読む */
export function loadLessons() {
  const out = [];
  for (const course of COURSE_ORDER) {
    let files = [];
    try {
      files = readdirSync(new URL(`${course}/`, COURSES_DIR)).filter((f) => f.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const f of files) out.push(...JSON.parse(readFileSync(new URL(`${course}/${f}`, COURSES_DIR), 'utf8')).lessons);
  }
  return out;
}

/** 条件に合う最初のレッスン。無ければ止める (検査を黙って飛ばさない) */
export function findLessonWith(lessons, pred, what) {
  const found = lessons.find(pred);
  if (!found) throw new Error(`問題データに ${what} のレッスンがありません`);
  return found;
}

export const hasKind = (lesson, kind) => lesson.questions.some((q) => q.kind === kind);
/** 穴埋めの空欄にメディアタイプ (match が media-type) がある問題か */
export const hasMediaBlank = (q) => (q.kind === 'command' || q.kind === 'http') && q.blanks.some((b) => b.match === 'media-type');

/** 結果から、正答数・採点した数・XP を数える (src/lib/lessonRun.ts の lessonScore と同じ数え方) */
export function expectedScore(questions, outcomes) {
  let correct = 0;
  let total = 0;
  let labs = 0;
  questions.forEach((q, i) => {
    if (q.kind === 'lab') {
      if (outcomes[i] === 'done') labs++;
      return;
    }
    total++;
    if (outcomes[i] === 'right') correct++;
  });
  return { correct, total, xp: correct * XP_PER_CORRECT + labs * XP_PER_LAB };
}

/**
 * 空欄に入れる正しい値。大文字と小文字を区別しない空欄 (header-name・media-type) は、わざと大文字と小文字を変えて入れ、
 * 区別せずに採点することも確かめる
 */
export function rightInputs(q) {
  return q.blanks.map((b) => {
    const a = b.answers[0];
    if (b.match === 'header-name') return a.toLowerCase() === a ? a.toUpperCase() : a.toLowerCase();
    if (b.match === 'media-type') {
      // type/subtype の大文字と小文字だけを変える (引数の値には区別するものがある)
      const [type, ...rest] = a.split(';');
      return [type.toUpperCase(), ...rest].join(';');
    }
    return a;
  });
}

/** 空欄に入れる誤った値 (どの正解とも合わない) */
const WRONG_TEXT = 'zz-wrong-answer';
const WRONG_MEDIA = 'application/x-zz-wrong';

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const choiceRadio = (page, q, choiceId) => page.getByRole('radio', { name: new RegExp(`^[A-D]\\. ${escapeRe(q.choices.find((c) => c.id === choiceId).text)}$`) });
export const orderIds = (page) => page.locator('[data-testid="order-rows"] > li').evaluateAll((ls) => ls.map((l) => l.dataset.item));
export const orderText = (q, id) => q.items.find((it) => it.id === id).text;

/** 要点の「問題を始める」のボタンの文字 (src/lib/intro.ts の INTRO_START_LABEL と同じ) */
export const INTRO_START = '問題を始める';

/**
 * レッスンを開いたあと、1 問目を出す。はじめてのレッスンは要点が先に出るので「問題を始める」を押す。
 * 済みのレッスンは要点が畳まれて 1 問目が出ているので、何もしない。どちらかが出るまで待つ
 */
export async function startLesson(page) {
  await page.locator('[data-testid="lesson-intro"], [data-testid="lesson-intro-folded"]').first().waitFor();
  if ((await page.getByTestId('lesson-intro').count()) > 0) await page.getByRole('button', { name: INTRO_START }).click();
  await page.getByTestId('lesson-intro-folded').waitFor();
}

export async function fill(page, values) {
  const inputs = page.locator('[data-testid="fill-code"] input');
  for (const [i, v] of values.entries()) await inputs.nth(i).fill(v);
}

/**
 * 並べ替えを「正しくない」答えで送るときの並び。どの始めの並びからでも、必ず正しい順と違う並びを返す。
 * まず今の並びのまま正しい順の先頭の項目だけを一番上へ送る (正しい位置の行と違う位置の行が混ざる)。
 * それで正しい順になってしまうとき (始めの並びが、先頭の項目の位置だけ違っていたとき) は、
 * 正しい順の最後の 2 つを入れ替えた並びにする (3 項目以上なら、正しい位置の行も残る)
 */
export function unsortedTarget(current, answer) {
  const head = answer[0];
  const moved = [head, ...current.filter((id) => id !== head)];
  if (moved.join('\n') !== answer.join('\n')) return moved;
  const n = answer.length;
  return [...answer.slice(0, n - 2), answer[n - 1], answer[n - 2]];
}

/** 並べ替えの行を target の並びにする。頭から順に、その位置の項目を上へのボタンで送る (上へだけでどの並びにもできる) */
export async function arrangeOrder(page, q, target) {
  for (const [t, id] of target.entries()) {
    for (let c = (await orderIds(page)).indexOf(id); c > t; c--) await page.getByRole('button', { name: `上へ: ${orderText(q, id)}` }).click();
  }
}

/**
 * 開いている問題に答えて送る。mode は次のどれか:
 *   right: 正しく答える (並べ替えは上下のボタンで正しい順にする。実習は全部の手順に印を付けて終える)
 *   wrong: 誤って答える (穴埋めは全部の空欄を誤り、4 択は正解でない選択肢を選ぶ)
 *   media: 穴埋めのメディアタイプの空欄だけを誤り、ほかの空欄は正しく答える
 *   unsorted: 並べ替えを、必ず正しい順と違う並びにして送る (409)。並びは unsortedTarget で決める
 * 答えたあとの応答の枠が出るまで待つ。次の問題へは進まない
 */
export async function answer(page, q, mode = 'right') {
  const send = () => page.getByRole('button', { name: 'POST 答えを送る' }).click();
  if (q.kind === 'command' || q.kind === 'http') {
    const right = rightInputs(q);
    const values = q.blanks.map((b, i) => (mode === 'right' ? right[i] : mode === 'media' ? (b.match === 'media-type' ? WRONG_MEDIA : right[i]) : b.match === 'media-type' ? WRONG_MEDIA : WRONG_TEXT));
    await fill(page, values);
    await send();
  } else if (q.kind === 'choice') {
    const id = mode === 'right' ? q.answer : q.choices.find((c) => c.id !== q.answer).id;
    await choiceRadio(page, q, id).check();
    await send();
  } else if (q.kind === 'order') {
    await arrangeOrder(page, q, mode === 'unsorted' ? unsortedTarget(await orderIds(page), q.answer) : q.answer);
    await send();
  } else if (q.kind === 'lab') {
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await page.getByRole('button', { name: 'POST 実習を終える' }).click();
  }
  await page.locator('section.response[data-status]').first().waitFor();
}

/** その答え方で出るはずの応答のコードと結果 (完了画面の一覧と、正誤の数え方に使う) */
export function expectedOutcome(q, mode) {
  if (q.kind === 'lab') return { code: 200, outcome: 'done' };
  if (mode === 'right') return { code: 200, outcome: 'right' };
  if (q.kind === 'order') return { code: 409, outcome: 'wrong' };
  if ((mode === 'media' || mode === 'wrong') && hasMediaBlank(q)) return { code: 415, outcome: 'wrong' };
  return { code: 400, outcome: 'wrong' };
}

const KINDS = ['command', 'http', 'order', 'choice', 'lab'];
/** 不正解の 400 を確かめるのに使える穴埋め (メディアタイプの空欄が無いもの) */
export const isPlainFill = (q) => (q.kind === 'command' || q.kind === 'http') && !hasMediaBlank(q);

/**
 * 通しで解くレッスン。並べ替え・4 択・メディアタイプの無い穴埋めを持つものから、5 種類のうち多くを持つものを選ぶ
 * (同じ数ならデータの順で先のもの)
 */
export function pickWalkLesson(lessons) {
  const score = (l) => KINDS.filter((k) => hasKind(l, k)).length;
  const cands = lessons.filter((l) => hasKind(l, 'order') && hasKind(l, 'choice') && l.questions.some(isPlainFill));
  if (cands.length === 0) throw new Error('問題データに、並べ替え・4 択・穴埋めを持つレッスンがありません');
  return cands.reduce((best, l) => (score(l) > score(best) ? l : best));
}

/**
 * needs (レッスンが満たすべき条件の名前と判定) を全部満たすレッスンの組。1 つで全部を満たすものがあればそれだけを、
 * 無ければ条件ごとに最初のものを返す。どれかを満たすレッスンが無ければ止める
 */
export function coverLessons(lessons, needs) {
  const entries = Object.entries(needs);
  if (entries.length === 0) return [];
  const all = lessons.find((l) => entries.every(([, pred]) => pred(l)));
  if (all) return [all];
  const out = [];
  for (const [what, pred] of entries) {
    const l = findLessonWith(lessons, pred, what);
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

/**
 * 模擬試験を開くときの種 (?seed=)。出題を固定し、どの問題が出たかで結果が変わらないようにする。
 * 別の出題で確かめたいときは E2E_EXAM_SEED で変える (落ちたら、ログの種で同じ出題を作り直せる)
 */
export const EXAM_SEED = Number(process.env.E2E_EXAM_SEED ?? 1);
