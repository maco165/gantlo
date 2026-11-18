#!/usr/bin/env node
// 問題データ (src/content/courses/<course>/*.json) の検査。src/content/types.ts と同じ欄を見る。様式は docs/content-format.md。
// 使い方: node scripts/check-content.mjs [ファイル ...]   (省略すると src/content/courses/*/*.json の全部)
// 置き場所の決まりは courses/ の下のファイルにだけ当てる。環境変数 GANTLO_COURSES_DIR で courses/ の場所を差し替えられる (検査のテスト用)。
// 通れば "OK <ファイル>" を出して終了コード 0。1 つでも違えば "NG <ファイル> <id>: <理由>" を出して終了コード 1。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COURSES_DIR = resolve(process.env.GANTLO_COURSES_DIR || join(ROOT, 'src/content/courses'));
const BLANK = '{{blank}}';
const KINDS = ['command', 'http', 'order', 'choice', 'lab'];
const TOOLS = ['curl', 'dig', 'openssl'];
const HTTP_FORMATS = ['http', 'json'];
const MATCHES = ['text', 'header-name', 'media-type'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** 4 択の選択肢の数 */
const CHOICE_COUNT = 4;

/** 使ってよい欄。ほかの欄は打ち間違いとして NG にする (任意の欄の打ち間違いで採点や表示が黙って変わらないように) */
const FIELDS = {
  file: ['lessons'],
  lesson: ['id', 'title', 'course', 'stage', 'questions'],
  question: ['id', 'kind', 'prompt', 'explanation', 'sources'],
  command: ['tool', 'code', 'blanks', 'output'],
  http: ['format', 'code', 'blanks'],
  order: ['items', 'answer'],
  choice: ['code', 'choices', 'answer', 'fixedOrder'],
  lab: ['steps', 'expected'],
  blank: ['answers', 'match'],
  item: ['id', 'text'],
  option: ['id', 'text', 'why'],
  step: ['text', 'command'],
  code: ['format', 'text'],
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
  process.exit(ok ? 0 : 1);
}
