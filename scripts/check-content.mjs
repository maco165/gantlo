#!/usr/bin/env node
// 問題データ (src/content/courses/<course>/*.json) の検査。src/content/types.ts と同じ欄を見る。様式は docs/content-format.md。
// 使い方: node scripts/check-content.mjs [ファイル ...]   (省略すると src/content/courses/*/*.json の全部)
// 置き場所の決まりは courses/ の下のファイルにだけ当てる。環境変数 GANTLO_COURSES_DIR で courses/ の場所を差し替えられる (検査のテスト用)。
// 通れば "OK <ファイル>" を出して終了コード 0。1 つでも違えば "NG <ファイル> <id>: <理由>" を出して終了コード 1。
// ファイルを指定しないときは、ハンドブック (src/content/handbook/) も検査する (checkHandbook。GANTLO_HANDBOOK_DIR で場所を差し替えられる)。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COURSES_DIR = resolve(process.env.GANTLO_COURSES_DIR || join(ROOT, 'src/content/courses'));
const HANDBOOK_DIR = resolve(process.env.GANTLO_HANDBOOK_DIR || join(ROOT, 'src/content/handbook'));
const BLANK = '{{blank}}';
const KINDS = ['command', 'http', 'order', 'choice', 'lab'];
const TOOLS = ['curl', 'dig', 'openssl'];
const HTTP_FORMATS = ['http', 'json'];
const MATCHES = ['text', 'header-name', 'media-type'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** レッスンの <title> (「題 | gantlo」) を 35 字に収める題の長さ。src/lib/pageMeta.ts の TITLE_MAX と同じ (tests/meta.test.ts が全ページを見る) */
const LESSON_TAB_TITLE_MAX = 35 - ' | gantlo'.length;
/** 4 択の選択肢の数 */
const CHOICE_COUNT = 4;
/** 要点: 分かるようになることの行数・説明の字数 (空白を除く)・1 文の字数の上限 (目安は 40 字)・図の項目の数・試すコマンドの数 */
export const INTRO_GOALS = 3;
export const INTRO_BODY_MIN = 200;
export const INTRO_BODY_MAX = 400;
export const INTRO_SENTENCE_MAX = 60;
const FIGURE_KINDS = ['flow', 'table'];
const FIGURE_ITEMS = [2, 8];
const TRY_MAX = 2;
/** 穴埋め 1 問のよくある誤答の数 (空欄を合わせて) と、説明の文の数の上限 */
export const WRONG_RANGE = [2, 4];
const WRONG_SENTENCES_MAX = 2;
/** 動詞の終わり (う段の仮名)。分かるようになることは「〜できる」「〜を読み分ける」のように動詞で終える */
const VERB_END = /[うくぐすつぬぶむる]$/;

/** 使ってよい欄。ほかの欄は打ち間違いとして NG にする (任意の欄の打ち間違いで採点や表示が黙って変わらないように) */
const FIELDS = {
  file: ['lessons'],
  lesson: ['id', 'title', 'shortTitle', 'course', 'stage', 'intro', 'questions'],
  question: ['id', 'kind', 'prompt', 'explanation', 'sources'],
  command: ['tool', 'code', 'blanks', 'output'],
  http: ['format', 'code', 'blanks'],
  order: ['items', 'answer'],
  choice: ['code', 'choices', 'answer', 'fixedOrder'],
  lab: ['steps', 'expected'],
  blank: ['answers', 'match', 'wrong'],
  wrong: ['answer', 'why'],
  intro: ['goals', 'body', 'figure', 'figureOmitted', 'tryIt', 'sources'],
  figure: ['kind', 'caption', 'items'],
  figureItem: ['label', 'note'],
  tryIt: ['command', 'expect'],
  item: ['id', 'text'],
  option: ['id', 'text', 'why'],
  step: ['text', 'command'],
  code: ['format', 'text'],
  handbookTopic: ['id', 'standard', 'title', 'summary', 'lessons', 'terms'],
  handbookSection: ['heading', 'text', 'code', 'output', 'note', 'sources'],
  handbookCode: ['language', 'text'],
  handbookSource: ['label', 'url'],
};

/**
 * TS のファイルの `export const <name> ... = [ ... ];` の中から `id: '...'` を拾う。
 * 段 (stages.ts) とコース (route.ts) の正本は TS にあり、この検査はそれを読む (写しを持たない)。
 * 拾った id が正本と同じことは tests/check-content.test.ts が確かめる。
 */
export function readIds(file, name) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${file} に ${name} がありません`);
  const open = src.indexOf('= [', start);
  const end = src.indexOf('];', open);
  return [...src.slice(open, end).matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** stages.ts の STAGES から、段の id と本編の何週目かを拾う */
export function readStages() {
  const src = readFileSync(join(ROOT, 'src/content/stages.ts'), 'utf8');
  const open = src.indexOf('= [', src.indexOf('export const STAGES'));
  const end = src.indexOf('];', open);
  return [...src.slice(open, end).matchAll(/\{\s*id:\s*'([^']+)'[^}]*?\bweek:\s*(\d+)/g)].map((m) => ({ id: m[1], week: Number(m[2]) }));
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

function isHttpsUrl(v) {
  if (!isNonEmptyString(v)) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 字数 (空白を除く) */
const charCount = (s) => [...s.replace(/\s+/g, '')].length;

/** 文に分ける (。！？で区切る) */
const sentences = (s) => s.split(/(?<=[。！？])/).map((x) => x.trim()).filter(Boolean);

/** 採点と同じくらいに揃えた形 (空白を詰め、ヘッダー名とメディアタイプは小文字)。正解と誤答の重なりを見る。本当の採点で見るのは tests/check-content.test.ts */
const roughNormalize = (b, v) => {
  const t = String(v).trim().replace(/\s+/g, ' ');
  return b?.match === 'header-name' || b?.match === 'media-type' ? t.toLowerCase().replace(/\s*;\s*/g, '; ') : t;
};

/** text の中に word が「語として」出るか (英数字の答えは前後が英数字・-・_ でないときだけ数える) */
export function containsWord(text, word, caseInsensitive) {
  const t = caseInsensitive ? text.toLowerCase() : text;
  const w = caseInsensitive ? word.toLowerCase() : word;
  if (w.trim() === '') return false;
  let from = 0;
  for (;;) {
    const i = t.indexOf(w, from);
    if (i < 0) return false;
    const before = t[i - 1] ?? '';
    const after = t[i + w.length] ?? '';
    const edge = (c, inner) => c === '' || !/[A-Za-z0-9_-]/.test(c) || !/[A-Za-z0-9_-]/.test(inner);
    if (edge(before, w[0]) && edge(after, w[w.length - 1])) return true;
    from = i + 1;
  }
}

/** 要点の文 (目標・説明・図・試すコマンドと出力) を 1 つの文字列にする。答えの漏れを見るため */
export const introText = (intro) =>
  [
    ...(intro?.goals ?? []),
    ...(intro?.body ?? []),
    intro?.figure?.caption ?? '',
    ...(intro?.figure?.items ?? []).flatMap((it) => [it?.label ?? '', it?.note ?? '']),
    ...(intro?.tryIt ?? []).flatMap((t) => [t?.command ?? '', t?.expect ?? '']),
  ].join('\n');

const isRfc = (u) => /^https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+/.test(u);

const countBlanks = (code) => (isNonEmptyString(code) ? code.split(BLANK).length - 1 : 0);

export function checkFiles(files, { stages, courseIds }) {
  const stageIds = stages.map((s) => s.id);
  const weekOf = new Map(stages.map((s) => [s.id, s.week]));
  const seenIds = new Map(); // id -> file
  const lines = [];
  let failed = false;

  for (const file of files) {
    const name = relative(process.cwd(), file);
    const errors = [];
    const ng = (id, msg) => errors.push(`NG ${name} ${id}: ${msg}`);
    /** obj の欄のうち、allowed に無いものを NG にする。where は欄の名前の前に付ける場所 (blanks[0]. など) */
    const onlyFields = (obj, allowed, id, where = '') => {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;
      for (const key of Object.keys(obj)) if (!allowed.includes(key)) ng(id, `知らない欄 (${where}${key}) です`);
    };
    const claimId = (id, where) => {
      if (!isNonEmptyString(id)) return ng(where, 'id がありません');
      if (!ID_PATTERN.test(id)) ng(id, 'id は英小文字・数字・- だけにします');
      if (seenIds.has(id)) ng(id, `id が重複しています (${seenIds.get(id)} と)`);
      else seenIds.set(id, name);
    };

    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      lines.push(`NG ${name} -: JSON として読めません (${e.message})`);
      failed = true;
      continue;
    }

    // コースはファイルの置き場所 (courses/<course>/) と同じにする
    // (検査のテストが一時フォルダに置いた写しは、置き場所を問わない)
    const folder = basename(dirname(resolve(file)));
    const inCourses = dirname(dirname(resolve(file))) === COURSES_DIR;
    if (inCourses && !courseIds.includes(folder)) ng('-', `置き場所 (courses/${folder}/) がコースの id ではありません`);
    // 本編は週ごとのファイル (week<N>.json) に、その週の段のレッスンだけを置く
    let week = null;
    if (inCourses && folder === 'main') {
      const m = /^week(\d+)\.json$/.exec(basename(file));
      if (m) week = Number(m[1]);
      else ng('-', '本編のファイル名は week<N>.json にします');
    }
    onlyFields(data, FIELDS.file, '-');
    if (!Array.isArray(data?.lessons) || data.lessons.length === 0) ng('-', 'lessons がありません');

    for (const [li, lesson] of (Array.isArray(data?.lessons) ? data.lessons : []).entries()) {
      const lid = isNonEmptyString(lesson?.id) ? lesson.id : `lessons[${li}]`;
      claimId(lesson?.id, lid);
      onlyFields(lesson, FIELDS.lesson, lid);
      if (!isNonEmptyString(lesson?.title)) ng(lid, 'title がありません');
      // <title> は「題 | gantlo」で 35 字まで (検索の結果で切られない長さ)。長い題には shortTitle を書く
      else if (lesson.shortTitle !== undefined) {
        if (!isNonEmptyString(lesson.shortTitle) || lesson.shortTitle.length > LESSON_TAB_TITLE_MAX) ng(lid, `shortTitle は ${LESSON_TAB_TITLE_MAX} 字までの文字にします`);
        else if (lesson.shortTitle.length >= lesson.title.length) ng(lid, 'shortTitle は title より短くします');
      } else if (lesson.title.length > LESSON_TAB_TITLE_MAX) ng(lid, `title が ${LESSON_TAB_TITLE_MAX} 字を超えます。タブと検索の結果に出す shortTitle (${LESSON_TAB_TITLE_MAX} 字まで) を書きます`);
      if (!courseIds.includes(lesson?.course)) ng(lid, `course は ${courseIds.join(' / ')} のどれかにします (${lesson?.course})`);
      else if (inCourses && lesson.course !== folder) ng(lid, `course (${lesson.course}) が置き場所 (courses/${folder}/) と違います`);
      if (lesson?.stage === undefined) {
        if (lesson?.course === 'main') ng(lid, 'stage (旅の段) がありません。本編では必須です');
      } else if (!stageIds.includes(lesson.stage)) ng(lid, `stage (${lesson.stage}) が src/content/stages.ts にありません`);
      else if (week !== null && weekOf.get(lesson.stage) !== week) ng(lid, `stage (${lesson.stage}) は第 ${weekOf.get(lesson.stage)} 週の段です。week${week}.json には第 ${week} 週の段のレッスンを置きます`);
      if (week !== null && isNonEmptyString(lesson?.id) && !lesson.id.startsWith(`main-w${week}-`)) ng(lid, `week${week}.json のレッスンの id は main-w${week}- で始めます`);
      if (!Array.isArray(lesson?.questions) || lesson.questions.length === 0) {
        ng(lid, 'questions がありません');
        continue;
      }
      checkIntro(lesson, lid, ng, onlyFields);

      for (const [qi, q] of lesson.questions.entries()) {
        const qid = isNonEmptyString(q?.id) ? q.id : `${lid}.questions[${qi}]`;
        claimId(q?.id, qid);
        if (isNonEmptyString(q?.id) && isNonEmptyString(lesson.id) && !q.id.startsWith(`${lesson.id}-`)) ng(qid, `問題の id はレッスンの id (${lesson.id}-) で始めます`);
        if (KINDS.includes(q?.kind)) onlyFields(q, [...FIELDS.question, ...FIELDS[q.kind]], qid);
        for (const key of ['prompt', 'explanation']) if (!isNonEmptyString(q?.[key])) ng(qid, `${key} がありません`);
        if (!Array.isArray(q?.sources) || q.sources.length === 0) ng(qid, 'sources (出典の URL の配列) がありません');
        else q.sources.forEach((s, si) => isHttpsUrl(s) || ng(qid, `sources[${si}] が https の URL ではありません (${s})`));

        switch (q?.kind) {
          case 'command':
          case 'http': {
            const max = q.kind === 'command' ? 1 : 2;
            if (q.kind === 'command' && !TOOLS.includes(q.tool)) ng(qid, `tool は ${TOOLS.join(' / ')} のどれかにします`);
            if (q.kind === 'http' && !HTTP_FORMATS.includes(q.format)) ng(qid, `format は ${HTTP_FORMATS.join(' / ')} のどれかにします`);
            const n = countBlanks(q.code);
            if (n < 1 || n > max) ng(qid, `code の ${BLANK} は${max === 1 ? 'ちょうど 1 つ' : ' 1〜2 つ'}にします (${n} 個)`);
            if (!Array.isArray(q.blanks) || q.blanks.length === 0) {
              ng(qid, 'blanks (空欄ごとの正解) がありません');
              break;
            }
            if (q.blanks.length !== n) ng(qid, `blanks の数 (${q.blanks.length}) が code の ${BLANK} の数 (${n}) と合いません`);
            for (const [bi, b] of q.blanks.entries()) {
              onlyFields(b, FIELDS.blank, qid, `blanks[${bi}].`);
              if (!Array.isArray(b?.answers) || b.answers.length === 0 || !b.answers.every(isNonEmptyString)) ng(qid, `blanks[${bi}].answers (正解の配列) がありません`);
              if (b?.match !== undefined && !MATCHES.includes(b.match)) ng(qid, `blanks[${bi}].match は ${MATCHES.join(' / ')} のどれかにします`);
            }
            checkWrong(q, qid, ng, onlyFields);
            if (q.output !== undefined && !isNonEmptyString(q.output)) ng(qid, 'output は空でない文字列にします');
            break;
          }
          case 'order': {
            const items = Array.isArray(q.items) ? q.items : [];
            if (items.length < 2) ng(qid, 'items は 2 つ以上要ります');
            for (const [ii, it] of items.entries()) {
              onlyFields(it, FIELDS.item, qid, `items[${ii}].`);
              if (!isNonEmptyString(it?.id) || !isNonEmptyString(it?.text)) ng(qid, `items[${ii}] に id か text がありません`);
            }
            const ids = items.map((it) => it?.id);
            if (new Set(ids).size !== ids.length) ng(qid, '項目の id が重複しています');
            if (!Array.isArray(q.answer) || q.answer.length === 0) {
              ng(qid, 'answer (正しい順の項目の id) がありません');
              break;
            }
            const sameSet = q.answer.length === ids.length && new Set(q.answer).size === q.answer.length && q.answer.every((id) => ids.includes(id));
            if (!sameSet) ng(qid, `正解の順 (${q.answer.join(',')}) が項目 (${ids.join(',')}) をちょうど 1 回ずつ並べたものになっていません`);
            break;
          }
          case 'choice': {
            const choices = Array.isArray(q.choices) ? q.choices : [];
            if (choices.length !== CHOICE_COUNT) ng(qid, `choices はちょうど ${CHOICE_COUNT} つにします (${choices.length} つ)`);
            const ids = choices.map((c) => c?.id);
            if (new Set(ids).size !== ids.length) ng(qid, '選択肢の id が重複しています');
            for (const [ci, c] of choices.entries()) {
              onlyFields(c, FIELDS.option, qid, `choices[${ci}].`);
              if (!isNonEmptyString(c?.id) || !isNonEmptyString(c?.text)) ng(qid, `choices[${ci}] に id か text がありません`);
              if (c?.why !== undefined && !isNonEmptyString(c.why)) ng(qid, `choices[${ci}].why は空でない文字列にします`);
            }
            if (!isNonEmptyString(q.answer)) ng(qid, 'answer (正解の選択肢の id) がありません');
            else if (!ids.includes(q.answer)) ng(qid, `正解 (${q.answer}) が選択肢にありません`);
            if (q.fixedOrder !== undefined && typeof q.fixedOrder !== 'boolean') ng(qid, 'fixedOrder は true か false にします');
            onlyFields(q.code, FIELDS.code, qid, 'code.');
            if (q.code !== undefined && (!isNonEmptyString(q.code?.text) || !isNonEmptyString(q.code?.format))) ng(qid, 'code は format と text を持ちます');
            break;
          }
          case 'lab': {
            if (!Array.isArray(q.steps) || q.steps.length === 0) ng(qid, 'steps がありません');
            for (const [si, step] of (Array.isArray(q.steps) ? q.steps : []).entries()) {
              onlyFields(step, FIELDS.step, qid, `steps[${si}].`);
              if (!isNonEmptyString(step?.text)) ng(qid, `steps[${si}] に text がありません`);
              if (step?.command !== undefined && !isNonEmptyString(step.command)) ng(qid, `steps[${si}] の command が空です`);
            }
            if (!isNonEmptyString(q.expected)) ng(qid, 'expected (観察できること) がありません');
            break;
          }
          default:
            ng(qid, `kind は ${KINDS.join(' / ')} のどれかにします (${q?.kind})`);
        }
      }
    }

    if (errors.length) {
      failed = true;
      lines.push(...errors);
    } else {
      lines.push(`OK ${name}`);
    }
  }
  return { ok: !failed, lines };
}

/** レッスンの要点 (intro)。全レッスンが持つ。答えの文字列 (同じレッスンの穴埋めの正解) を書かない */
function checkIntro(lesson, lid, ng, onlyFields) {
  const intro = lesson.intro;
  if (typeof intro !== 'object' || intro === null || Array.isArray(intro)) return ng(lid, 'intro (問題の前に読む要点) がありません');
  onlyFields(intro, FIELDS.intro, lid, 'intro.');
  const goals = intro.goals;
  if (!Array.isArray(goals) || goals.length !== INTRO_GOALS || !goals.every(isNonEmptyString)) ng(lid, `intro.goals (分かるようになること) はちょうど ${INTRO_GOALS} 行の文字にします`);
  else goals.forEach((g, gi) => VERB_END.test(g.trim()) || ng(lid, `intro.goals[${gi}] は動詞で終えます (「〜できる」「〜を読み分ける」など): ${g}`));
  if (!Array.isArray(intro.body) || intro.body.length === 0 || !intro.body.every(isNonEmptyString)) ng(lid, 'intro.body (短い説明の段落の配列) がありません');
  else {
    const n = charCount(intro.body.join(''));
    if (n < INTRO_BODY_MIN || n > INTRO_BODY_MAX) ng(lid, `intro.body は合わせて ${INTRO_BODY_MIN}〜${INTRO_BODY_MAX} 字にします (${n} 字)`);
    for (const st of intro.body.flatMap(sentences)) if (charCount(st) > INTRO_SENTENCE_MAX) ng(lid, `intro.body の 1 文は ${INTRO_SENTENCE_MAX} 字までにします (目安は 40 字): ${st}`);
  }
  if ((intro.figure === undefined) === (intro.figureOmitted === undefined)) ng(lid, 'intro は figure (図) か figureOmitted (図を省く理由) のどちらか一方を持ちます');
  if (intro.figureOmitted !== undefined && !isNonEmptyString(intro.figureOmitted)) ng(lid, 'intro.figureOmitted は空でない文字列にします');
  if (intro.figure !== undefined) {
    const f = intro.figure;
    onlyFields(f, FIELDS.figure, lid, 'intro.figure.');
    if (!FIGURE_KINDS.includes(f?.kind)) ng(lid, `intro.figure.kind は ${FIGURE_KINDS.join(' / ')} のどれかにします`);
    if (!isNonEmptyString(f?.caption)) ng(lid, 'intro.figure.caption (図の説明) がありません');
    const items = Array.isArray(f?.items) ? f.items : [];
    if (items.length < FIGURE_ITEMS[0] || items.length > FIGURE_ITEMS[1]) ng(lid, `intro.figure.items は ${FIGURE_ITEMS[0]}〜${FIGURE_ITEMS[1]} 個にします (${items.length} 個)`);
    for (const [ii, it] of items.entries()) {
      onlyFields(it, FIELDS.figureItem, lid, `intro.figure.items[${ii}].`);
      if (!isNonEmptyString(it?.label)) ng(lid, `intro.figure.items[${ii}].label がありません`);
      if (it?.note !== undefined && !isNonEmptyString(it.note)) ng(lid, `intro.figure.items[${ii}].note は空でない文字列にします`);
      if (f?.kind === 'table' && !isNonEmptyString(it?.note)) ng(lid, `intro.figure.items[${ii}].note がありません (表は名前と意味の 2 列)`);
    }
  }
  if (intro.tryIt !== undefined) {
    if (!Array.isArray(intro.tryIt) || intro.tryIt.length === 0 || intro.tryIt.length > TRY_MAX) ng(lid, `intro.tryIt (手元で試すコマンド) は 1〜${TRY_MAX} 個にします`);
    for (const [ti, t] of (Array.isArray(intro.tryIt) ? intro.tryIt : []).entries()) {
      onlyFields(t, FIELDS.tryIt, lid, `intro.tryIt[${ti}].`);
      if (!isNonEmptyString(t?.command) || !isNonEmptyString(t?.expect)) ng(lid, `intro.tryIt[${ti}] は command と expect (期待する出力の要点) を持ちます`);
    }
  }
  if (!Array.isArray(intro.sources) || intro.sources.length === 0) ng(lid, 'intro.sources (出典の URL の配列) がありません');
  else
    intro.sources.forEach((u, si) => {
      if (!isHttpsUrl(u)) ng(lid, `intro.sources[${si}] が https の URL ではありません (${u})`);
      else if (isRfc(u) && !/#section-[\d.]+$/.test(u)) ng(lid, `intro.sources[${si}] の RFC は節まで指します (#section-…): ${u}`);
    });
  // 答えを要点に書かない: 同じレッスンの穴埋めの正解 (別解も) が要点の文に出たら NG
  const text = introText(intro);
  for (const q of lesson.questions) {
    if (q?.kind !== 'command' && q?.kind !== 'http') continue;
    for (const b of Array.isArray(q.blanks) ? q.blanks : [])
      for (const a of Array.isArray(b?.answers) ? b.answers : [])
        if (isNonEmptyString(a) && containsWord(text, a.trim(), b.match === 'header-name' || b.match === 'media-type')) ng(lid, `intro に ${q.id} の答え (${a}) が書いてあります。答えの文字列は書かず、考え方を書きます`);
  }
}

/** 穴埋めのよくある誤答 (blanks[].wrong)。問題ごとに合わせて 2〜4 個。正解と同じものや重なりは NG */
function checkWrong(q, qid, ng, onlyFields) {
  const blanks = Array.isArray(q.blanks) ? q.blanks : [];
  let total = 0;
  for (const [bi, b] of blanks.entries()) {
    if (b?.wrong === undefined) continue;
    if (!Array.isArray(b.wrong)) {
      ng(qid, `blanks[${bi}].wrong は誤答の配列にします`);
      continue;
    }
    total += b.wrong.length;
    const seen = new Set();
    const rights = new Set((Array.isArray(b.answers) ? b.answers : []).map((a) => roughNormalize(b, a)));
    for (const [wi, w] of b.wrong.entries()) {
      onlyFields(w, FIELDS.wrong, qid, `blanks[${bi}].wrong[${wi}].`);
      if (!isNonEmptyString(w?.answer) || !isNonEmptyString(w?.why)) {
        ng(qid, `blanks[${bi}].wrong[${wi}] は answer (誤答) と why (なぜ違うか) を持ちます`);
        continue;
      }
      const key = roughNormalize(b, w.answer);
      if (rights.has(key)) ng(qid, `blanks[${bi}].wrong[${wi}] の誤答 (${w.answer}) が正解と同じです`);
      if (seen.has(key)) ng(qid, `blanks[${bi}].wrong[${wi}] の誤答 (${w.answer}) が重なっています`);
      seen.add(key);
      if (sentences(w.why).length > WRONG_SENTENCES_MAX) ng(qid, `blanks[${bi}].wrong[${wi}].why は ${WRONG_SENTENCES_MAX} 文までにします`);
    }
  }
  if (total < WRONG_RANGE[0] || total > WRONG_RANGE[1]) ng(qid, `よくある誤答 (blanks[].wrong) を合わせて ${WRONG_RANGE[0]}〜${WRONG_RANGE[1]} 個書きます (${total} 個)`);
}

/**
 * ハンドブックの検査。目録 (<dir>/topics.json) と項目ごとの本文 (<dir>/sections/<id>.json) を見る。
 * 目録の項目には本文のファイルが要り、本文のファイルには目録の項目が要る。どの節にも https の出典が 1 つ以上要る。
 * 扱う規格・関係するレッスン・用語は、用語集とレッスンに実在する id に限る (両向きのリンクが壊れないように)
 */
export function checkHandbook(dir, { lessonIds, termIds, standardIds }) {
  const lines = [];
  let failed = false;
  const topicsFile = join(dir, 'topics.json');
  const sectionsDir = join(dir, 'sections');
  const name = relative(ROOT, topicsFile);
  const errors = [];
  const ng = (file, id, reason) => errors.push(`NG ${file} ${id}: ${reason}`);
  const onlyFields = (obj, allowed, file, id, prefix = '') => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const k of Object.keys(obj)) if (!allowed.includes(k)) ng(file, id, `知らない欄 ${prefix}${k}`);
  };
  let topics = [];
  try {
    const data = JSON.parse(readFileSync(topicsFile, 'utf8'));
    onlyFields(data, ['topics'], name, '-');
    if (!Array.isArray(data?.topics) || data.topics.length === 0) ng(name, '-', 'topics (項目の配列) がありません');
    else topics = data.topics;
  } catch (e) {
    ng(name, '-', `読めません (${e.message})`);
  }
  const sectionFiles = existsSync(sectionsDir) ? readdirSync(sectionsDir).filter((f) => f.endsWith('.json')) : [];
  const seen = new Set();
  for (const [i, t] of topics.entries()) {
    const id = isNonEmptyString(t?.id) ? t.id : `topics[${i}]`;
    onlyFields(t, FIELDS.handbookTopic, name, id);
    if (!isNonEmptyString(t?.id) || !ID_PATTERN.test(t.id)) ng(name, id, 'id は英小文字・数字・- にします');
    else if (seen.has(t.id)) ng(name, id, 'id が重なっています');
    seen.add(t?.id);
    if (!isNonEmptyString(t?.title)) ng(name, id, 'title がありません');
    else if (t.title.length > LESSON_TAB_TITLE_MAX) ng(name, id, `title は ${LESSON_TAB_TITLE_MAX} 字までにします (<title> を 35 字に収めるため)`);
    if (!isNonEmptyString(t?.summary)) ng(name, id, 'summary がありません');
    if (!standardIds.includes(t?.standard)) ng(name, id, `standard (${t?.standard}) が用語集の規格の語にありません`);
    if (!Array.isArray(t?.lessons)) ng(name, id, 'lessons (配列) がありません');
    else for (const l of t.lessons) if (!lessonIds.includes(l)) ng(name, id, `lessons の ${l} が問題データにありません`);
    if (!Array.isArray(t?.terms) || t.terms.length === 0) ng(name, id, 'terms (用語集の語の id) がありません');
    else {
      for (const term of t.terms) if (!termIds.includes(term)) ng(name, id, `terms の ${term} が用語集にありません`);
      if (new Set(t.terms).size !== t.terms.length) ng(name, id, 'terms に同じ語が重なっています');
    }
    if (Array.isArray(t?.lessons) && new Set(t.lessons).size !== t.lessons.length) ng(name, id, 'lessons に同じレッスンが重なっています');

    const file = join(sectionsDir, `${t?.id}.json`);
    const fname = relative(ROOT, file);
    if (!existsSync(file)) {
      ng(fname, id, '本文のファイルがありません');
      continue;
    }
    let sections;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      onlyFields(data, ['sections'], fname, id);
      sections = data?.sections;
    } catch (e) {
      ng(fname, id, `読めません (${e.message})`);
      continue;
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      ng(fname, id, 'sections (節の配列) がありません');
      continue;
    }
    // 見出し・段落は画面の key と目次に使うので、項目の中で重ねない
    const headings = sections.map((s) => s?.heading);
    if (new Set(headings).size !== headings.length) ng(fname, id, '節の見出しが重なっています');
    for (const [si, s] of sections.entries()) {
      const sid = `${id} sections[${si}]`;
      if (Array.isArray(s?.text) && new Set(s.text).size !== s.text.length) ng(fname, sid, '同じ段落が重なっています');
      const urls = Array.isArray(s?.sources) ? s.sources.map((x) => x?.url) : [];
      if (new Set(urls).size !== urls.length) ng(fname, sid, 'sources に同じ URL が重なっています');
      onlyFields(s, FIELDS.handbookSection, fname, sid);
      if (!isNonEmptyString(s?.heading)) ng(fname, sid, 'heading がありません');
      if (!Array.isArray(s?.text) || s.text.length === 0 || !s.text.every(isNonEmptyString)) ng(fname, sid, 'text (段落の配列) がありません');
      if (s?.code !== undefined) {
        onlyFields(s.code, FIELDS.handbookCode, fname, sid, 'code.');
        if (!isNonEmptyString(s.code?.language) || !isNonEmptyString(s.code?.text)) ng(fname, sid, 'code は language と text を持ちます');
      }
      if (s?.output !== undefined && (!isNonEmptyString(s.output) || s.code === undefined)) ng(fname, sid, 'output は code のある節に、空でない文字列で書きます');
      if (s?.note !== undefined && !isNonEmptyString(s.note)) ng(fname, sid, 'note が空です');
      if (!Array.isArray(s?.sources) || s.sources.length === 0) ng(fname, sid, 'sources (出典) がありません');
      for (const [ri, src] of (Array.isArray(s?.sources) ? s.sources : []).entries()) {
        onlyFields(src, FIELDS.handbookSource, fname, sid, `sources[${ri}].`);
        if (!isNonEmptyString(src?.label)) ng(fname, sid, `sources[${ri}] に label がありません`);
        if (!isHttpsUrl(src?.url)) ng(fname, sid, `sources[${ri}] の url が https の URL ではありません`);
        // 書き出す HTML の属性に入るので空白・" < > を入れない。RFC は節まで指す (用語集の検査 src/lib/glossary.ts と同じ決まり)
        else if (/[\s"<>]/.test(src.url)) ng(fname, sid, `sources[${ri}] の url に空白・" < > を入れません`);
        else if (new URL(src.url).hostname === 'www.rfc-editor.org' && !/^https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+#section-\d+(?:\.\d+)*$/.test(src.url)) ng(fname, sid, `sources[${ri}] の RFC は節まで指します (${src.url})`);
      }
    }
    lines.push(`OK ${fname}`);
  }
  for (const f of sectionFiles) if (!seen.has(basename(f, '.json'))) ng(relative(ROOT, join(sectionsDir, f)), basename(f, '.json'), '目録 (topics.json) にない項目の本文です');
  if (errors.length) {
    failed = true;
    return { ok: false, lines: errors };
  }
  return { ok: !failed, lines: [`OK ${name}`, ...lines] };
}

/** 問題データのファイルから、レッスンの id を集める (読めないファイルは飛ばす。そのファイルは checkFiles が NG にする) */
function lessonIdsOf(files) {
  return files.flatMap((f) => {
    try {
      return JSON.parse(readFileSync(f, 'utf8')).lessons.map((l) => l.id);
    } catch {
      return [];
    }
  });
}

function defaultFiles() {
  if (!existsSync(COURSES_DIR)) return [];
  return readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(COURSES_DIR, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(COURSES_DIR, d.name, f)),
    )
    .sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const files = args.length ? args : defaultFiles();
  if (files.length === 0) {
    console.log('NG - -: 問題データがありません');
    process.exit(1);
  }
  const { ok, lines } = checkFiles(files, {
    stages: readStages(),
    courseIds: readIds('src/lib/route.ts', 'COURSES'),
  });
  for (const line of lines) console.log(line);
  let handbookOk = true;
  if (args.length === 0) {
    const glossary = JSON.parse(readFileSync(join(ROOT, 'src/content/glossary.json'), 'utf8')).terms;
    const hb = checkHandbook(HANDBOOK_DIR, {
      lessonIds: lessonIdsOf(files),
      termIds: glossary.map((t) => t.id),
      standardIds: glossary.filter((t) => t.standard !== undefined).map((t) => t.id),
    });
    for (const line of hb.lines) console.log(line);
    handbookOk = hb.ok;
  }
  process.exit(ok && handbookOk ? 0 : 1);
}
