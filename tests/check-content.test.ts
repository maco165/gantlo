// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/content/stages';
import { COURSES } from '../src/lib/route';

const SCRIPT = join(__dirname, '../scripts/check-content.mjs');
// 変えて NG を確かめる元は、本物の問題とは別に置いた 1 レッスンの写し (5 種類を 1 問ずつ、この順で持つ)。
// 本物の問題を書き換えても、ここの検査が崩れないようにするため
const SAMPLE = join(__dirname, 'fixtures/check-content-sample.json');

function run(files?: string | string[], coursesDir?: string): { code: number; out: string } {
  const args = files === undefined ? [] : Array.isArray(files) ? files : [files];
  const env = coursesDir ? { ...process.env, GANTLO_COURSES_DIR: coursesDir } : process.env;
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', env });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
}

/** 見本のデータの写しを一時フォルダに置いて変える (本物は変えない) */
function mutate(name: string, fn: (d: any) => void): string {
  const data = JSON.parse(readFileSync(SAMPLE, 'utf8'));
  fn(data);
  const file = join(mkdtempSync(join(tmpdir(), 'gantlo-content-')), `${name}.json`);
  writeFileSync(file, JSON.stringify(data));
  return file;
}

const q = (d: any, i: number) => d.lessons[0].questions[i];

/** 見本の写しを、一時フォルダの courses/<course>/<name> に置く。置き場所の決まりを確かめるため、その courses/ を検査に渡す */
function placed(course: string, name: string, fn: (d: any) => void = () => {}): { file: string; dir: string } {
  const data = JSON.parse(readFileSync(SAMPLE, 'utf8'));
  fn(data);
  const dir = join(mkdtempSync(join(tmpdir(), 'gantlo-courses-')), 'courses');
  mkdirSync(join(dir, course), { recursive: true });
  const file = join(dir, course, name);
  writeFileSync(file, JSON.stringify(data));
  return { file, dir };
}

/** レッスンと問題の id を、本編の別の週のものに付け替える */
const toWeek = (n: number, stage: string) => (d: any) => {
  const l = d.lessons[0];
  l.id = `main-w${n}-l1`;
  l.stage = stage;
  l.questions.forEach((x: any, i: number) => (x.id = `main-w${n}-l1-q${i + 1}`));
};

// node を何度も起こすので、重い機械や CI でも落ちないよう 1 件 30 秒まで待つ
describe('check-content', { timeout: 30_000 }, () => {
  it('本物のデータは OK で終了コード 0', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^OK .*week1\.json/m);
    expect(r.out).not.toContain('NG');
  });

  it('必須の欄 (id・種類・問題文・解説・出典) を 1 つ消すと NG (ファイル名と id を出す)', () => {
    for (const key of ['id', 'kind', 'prompt', 'explanation', 'sources']) {
      const r = run(mutate(`no-${key}`, (d) => delete q(d, 1)[key]));
      expect(r.code, key).toBe(1);
      // id を消した問題は、レッスンの id と何問目かで指す
      expect(r.out, key).toMatch(new RegExp(`^NG .*no-${key}\\.json main-w1-l1(-q2|\\.questions\\[1\\]): `, 'm'));
    }
  });

  it('種類ごとの正解の欄を消すと NG', () => {
    const cases: [string, number, string][] = [
      ['command', 0, 'blanks'],
      ['http', 1, 'blanks'],
      ['order', 2, 'answer'],
      ['choice', 3, 'answer'],
      ['lab', 4, 'expected'],
    ];
    for (const [kind, i, key] of cases) {
      const r = run(mutate(`no-answer-${kind}`, (d) => delete q(d, i)[key]));
      expect(r.code, kind).toBe(1);
      expect(r.out, kind).toMatch(new RegExp(`^NG .*no-answer-${kind}\\.json main-w1-l1-q${i + 1}: ${key}`, 'm'));
    }
    const emptyAlt = run(mutate('empty-answers', (d) => (q(d, 0).blanks[0].answers = [])));
    expect(emptyAlt.out).toMatch(/NG .*empty-answers\.json main-w1-l1-q1: blanks\[0\]\.answers/);
  });

  it('題が長い (サイト名を付けて 35 字を超える) のに shortTitle が無い・長い・題より長いと NG', () => {
    const long = 'あ'.repeat(27);
    const cases: [string, (l: any) => void, RegExp][] = [
      ['no-short', (l) => (l.title = long), /title が 26 字を超えます/],
      ['long-short', (l) => ((l.title = long + 'い'), (l.shortTitle = long)), /shortTitle は 26 字まで/],
      ['short-not-shorter', (l) => ((l.title = '短い題'), (l.shortTitle = '短い題です')), /shortTitle は title より短く/],
    ];
    for (const [name, change, msg] of cases) {
      const r = run(mutate(name, (d) => change(d.lessons[0])));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(msg);
    }
    expect(run(mutate('ok-short', (d) => ((d.lessons[0].title = long), (d.lessons[0].shortTitle = '短い題')))).code).toBe(0);
  });

  it('4 択の正解が選択肢に無いと NG', () => {
    const r = run(mutate('bad-choice', (d) => (q(d, 3).answer = 'z')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*bad-choice\.json main-w1-l1-q4: 正解 \(z\) が選択肢にありません/m);
  });

  it('並べ替えの正解の順が項目と合わないと NG (足りない・知らない id・重なり)', () => {
    const cases: [string, (a: string[]) => string[]][] = [
      ['order-short', (a) => a.slice(0, 3)],
      ['order-unknown', (a) => [...a.slice(0, 3), 'udp']],
      ['order-dup', (a) => [a[0], a[0], a[2], a[3]]],
    ];
    for (const [name, change] of cases) {
      const r = run(mutate(name, (d) => (q(d, 2).answer = change(q(d, 2).answer))));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(new RegExp(`^NG .*${name}\\.json main-w1-l1-q3: 正解の順`, 'm'));
    }
    // 並びを入れ替えただけなら、検査は通す (正しい順かは書く人と見る人が決める)
    expect(run(mutate('order-swap', (d) => q(d, 2).answer.reverse())).code).toBe(0);
  });

  it('問題 id が重複すると NG', () => {
    const r = run(mutate('dup-id', (d) => (q(d, 1).id = 'main-w1-l1-q1')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*dup-id\.json main-w1-l1-q1: id が重複しています/m);
  });

  it('レッスンの旅の段が stages.ts に無いと NG。本編では段が要る', () => {
    const r = run(mutate('bad-stage', (d) => (d.lessons[0].stage = 'udp')));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*bad-stage\.json main-w1-l1: stage \(udp\) が src\/content\/stages\.ts にありません/m);
    expect(run(mutate('no-stage', (d) => delete d.lessons[0].stage)).out).toMatch(/main-w1-l1: stage \(旅の段\) がありません/);
    // 本編以外のコースは段が無くてよい
    const other = (d: any) => {
      d.lessons[0].course = 'mgmt-history';
      delete d.lessons[0].stage;
    };
    expect(run(mutate('other-course', other)).code).toBe(0);
  });

  it('出典が https でないと NG', () => {
    const r = run(mutate('http-source', (d) => (q(d, 3).sources = ['http://www.rfc-editor.org/rfc/rfc9110'])));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*http-source\.json main-w1-l1-q4: sources\[0\] が https の URL ではありません/m);
    expect(run(mutate('empty-sources', (d) => (q(d, 3).sources = []))).out).toMatch(/main-w1-l1-q4: sources/);
  });

  it('穴埋めの空欄の数が合わないと NG', () => {
    expect(run(mutate('cmd-two', (d) => (q(d, 0).code += ' {{blank}}'))).out).toMatch(/main-w1-l1-q1: code の \{\{blank\}\} はちょうど 1 つ/);
    expect(run(mutate('http-three', (d) => (q(d, 1).code += '\n{{blank}}'))).out).toMatch(/main-w1-l1-q2: code の \{\{blank\}\} は 1〜2 つ/);
    expect(run(mutate('http-blanks', (d) => q(d, 1).blanks.pop())).out).toMatch(/main-w1-l1-q2: blanks の数 \(1\) が/);
  });

  it('知らない種類・コース・match と、id の形の違いは NG', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['bad-kind', (d) => (q(d, 0).kind = 'fill'), /main-w1-l1-q1: kind は/],
      ['bad-course', (d) => (d.lessons[0].course = 'k8s'), /main-w1-l1: course は/],
      ['bad-match', (d) => (q(d, 1).blanks[0].match = 'header'), /main-w1-l1-q2: blanks\[0\]\.match は/],
      ['bad-id', (d) => (q(d, 0).id = 'Main_Q1'), /Main_Q1: id は英小文字/],
      ['bad-prefix', (d) => (q(d, 0).id = 'other-q1'), /other-q1: 問題の id はレッスンの id/],
      ['bad-tool', (d) => (q(d, 0).tool = 'wget'), /main-w1-l1-q1: tool は/],
    ];
    for (const [name, fn, re] of cases) {
      const r = run(mutate(name, fn));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(re);
    }
  });

  it('JSON として読めないファイルは NG', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'gantlo-content-')), 'broken.json');
    writeFileSync(file, '{"lessons": [');
    const r = run(file);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*broken\.json -: JSON として読めません/m);
  });

  it('知らない欄 (打ち間違い) は NG', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['typo-match', (d) => (q(d, 1).blanks[0].Match = 'header-name'), /main-w1-l1-q2: 知らない欄 \(blanks\[0\]\.Match\) です/],
      ['typo-fixedorder', (d) => (q(d, 3).fixedorder = true), /main-w1-l1-q4: 知らない欄 \(fixedorder\) です/],
      ['typo-whyy', (d) => (q(d, 3).choices[1].whyy = '違う'), /main-w1-l1-q4: 知らない欄 \(choices\[1\]\.whyy\) です/],
      ['typo-source', (d) => (q(d, 0).source = 'https://curl.se/'), /main-w1-l1-q1: 知らない欄 \(source\) です/],
      ['typo-other-kind', (d) => (q(d, 0).items = []), /main-w1-l1-q1: 知らない欄 \(items\) です/],
      ['typo-lesson', (d) => (d.lessons[0].stages = 'http'), /main-w1-l1: 知らない欄 \(stages\) です/],
      ['typo-file', (d) => (d.lesson = []), /NG \S+ -: 知らない欄 \(lesson\) です/],
      ['typo-item', (d) => (q(d, 2).items[0].txt = 'x'), /main-w1-l1-q3: 知らない欄 \(items\[0\]\.txt\) です/],
      ['typo-step', (d) => (q(d, 4).steps[0].cmd = 'ls'), /main-w1-l1-q5: 知らない欄 \(steps\[0\]\.cmd\) です/],
      ['typo-code', (d) => (q(d, 3).code = { format: 'http', text: 'x', lang: 'y' }), /main-w1-l1-q4: 知らない欄 \(code\.lang\) です/],
    ];
    for (const [name, fn, re] of cases) {
      const r = run(mutate(name, fn));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(re);
    }
  });

  it('ファイルをまたいで問題 id やレッスン id が重なると NG', () => {
    const a = mutate('a', () => {});
    const b = mutate('b', (d) => (d.lessons[0].id = 'main-w1-l9'));
    const r = run([a, b]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^OK .*a\.json/m);
    expect(r.out).toMatch(/^NG .*b\.json main-w1-l1-q1: id が重複しています \(.*a\.json と\)/m);
    const c = mutate('c', (d) => d.lessons[0].questions.forEach((x: any, i: number) => (x.id = `main-w1-l1-x${i}`)));
    expect(run([a, c]).out).toMatch(/^NG .*c\.json main-w1-l1: id が重複しています/m);
    // 同じファイルの中のレッスン id の重なり
    const twice = mutate('twice', (d) => d.lessons.push({ ...d.lessons[0], questions: [] }));
    expect(run(twice).out).toMatch(/^NG .*twice\.json main-w1-l1: id が重複しています/m);
  });

  it('置き場所 (courses/<course>/) とコースが合わないと NG', () => {
    const ok = placed('main', 'week1.json');
    expect(run(ok.file, ok.dir).code).toBe(0);
    expect(run(undefined, ok.dir).out).toMatch(/^OK .*courses\/main\/week1\.json/m);
    const wrong = placed('spring', 'basics.json');
    const r = run(wrong.file, wrong.dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*spring\/basics\.json main-w1-l1: course \(main\) が置き場所 \(courses\/spring\/\) と違います/m);
    const unknown = placed('k8s', 'basics.json');
    expect(run(unknown.file, unknown.dir).out).toMatch(/^NG .*k8s\/basics\.json -: 置き場所 \(courses\/k8s\/\) がコースの id ではありません/m);
  });

  it('本編の week<N>.json には第 N 週の段のレッスンを、main-w<N>- の id で置く', () => {
    const stageWeek = placed('main', 'week2.json', (d) => {
      toWeek(2, 'dns')(d);
      d.lessons[0].stage = 'http';
    });
    const r = run(stageWeek.file, stageWeek.dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^NG .*week2\.json main-w2-l1: stage \(http\) は第 1 週の段です。week2\.json には第 2 週の段のレッスンを置きます/m);
    const idWeek = placed('main', 'week2.json', (d) => (d.lessons[0].stage = 'dns'));
    expect(run(idWeek.file, idWeek.dir).out).toMatch(/^NG .*week2\.json main-w1-l1: week2\.json のレッスンの id は main-w2- で始めます/m);
    const good = placed('main', 'week2.json', toWeek(2, 'dns'));
    expect(run(good.file, good.dir).code).toBe(0);
    const badName = placed('main', 'intro.json');
    expect(run(badName.file, badName.dir).out).toMatch(/^NG .*intro\.json -: 本編のファイル名は week<N>\.json にします/m);
    // 本編でないコースには週の決まりを当てない
    const other = placed('security', 'basics.json', (d) => (d.lessons[0].course = 'security'));
    expect(run(other.file, other.dir).code).toBe(0);
  });

  it('4 択は選択肢がちょうど 4 つ', () => {
    for (const [name, n] of [['three', 3], ['five', 5]] as const) {
      const r = run(
        mutate(`choices-${name}`, (d) => {
          const cs = q(d, 3).choices;
          q(d, 3).choices = n < cs.length ? cs.slice(0, n) : [...cs, { id: 'e', text: '418 I\'m a teapot' }];
        }),
      );
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(new RegExp(`main-w1-l1-q4: choices はちょうど 4 つにします \\(${n} つ\\)`));
    }
  });

  it('ほかの決まりも 1 つずつ NG にする', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['dup-choice-id', (d) => (q(d, 3).choices[1].id = 'a'), /main-w1-l1-q4: 選択肢の id が重複しています/],
      ['dup-item-id', (d) => (q(d, 2).items[1].id = 'dns'), /main-w1-l1-q3: 項目の id が重複しています/],
      ['one-item', (d) => {
        q(d, 2).items = q(d, 2).items.slice(0, 1);
        q(d, 2).answer = ['dns'];
      }, /main-w1-l1-q3: items は 2 つ以上要ります/],
      ['no-steps', (d) => (q(d, 4).steps = []), /main-w1-l1-q5: steps がありません/],
      ['step-no-text', (d) => (q(d, 4).steps[0].text = ''), /main-w1-l1-q5: steps\[0\] に text がありません/],
      ['no-format', (d) => delete q(d, 1).format, /main-w1-l1-q2: format は http \/ json のどれか/],
      ['no-title', (d) => delete d.lessons[0].title, /main-w1-l1: title がありません/],
      ['empty-lessons', (d) => (d.lessons = []), /NG \S+ -: lessons がありません/],
      ['answers-number', (d) => (q(d, 0).blanks[0].answers = [1]), /main-w1-l1-q1: blanks\[0\]\.answers/],
      ['fixedorder-string', (d) => (q(d, 3).fixedOrder = 'yes'), /main-w1-l1-q4: fixedOrder は true か false にします/],
    ];
    for (const [name, fn, re] of cases) {
      const r = run(mutate(name, fn));
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(re);
    }
  });

  it('要点 (intro) の決まりを 1 つずつ NG にする (全レッスンが持つ・3 行・動詞で終える・字数・図・出典・答えを書かない)', async () => {
    const { checkFiles, readStages, readIds } = await import(pathToFileURL(SCRIPT).href);
    const opts = { stages: readStages(), courseIds: readIds('src/lib/route.ts', 'COURSES') };
    const intro = (d: any) => d.lessons[0].intro;
    const long = 'あ'.repeat(39) + '。';
    const cases: [string, (d: any) => void, RegExp][] = [
      ['no-intro', (d) => delete d.lessons[0].intro, /main-w1-l1: intro \(問題の前に読む要点\) がありません/],
      ['two-goals', (d) => (intro(d).goals = intro(d).goals.slice(0, 2)), /intro\.goals \(分かるようになること\) はちょうど 3 行/],
      ['four-goals', (d) => intro(d).goals.push('もう 1 つ読む'), /intro\.goals \(分かるようになること\) はちょうど 3 行/],
      ['goal-noun', (d) => (intro(d).goals[1] = 'ヘッダーの読み方'), /intro\.goals\[1\] は動詞で終えます/],
      ['body-short', (d) => (intro(d).body = ['短い説明です。']), /intro\.body は合わせて 200〜400 字にします \(7 字\)/],
      ['body-long', (d) => (intro(d).body = Array(11).fill(long)), /intro\.body は合わせて 200〜400 字にします \(440 字\)/],
      ['sentence-long', (d) => (intro(d).body[0] = 'あ'.repeat(61) + '。'), /intro\.body の 1 文は 60 字までにします/],
      ['no-figure', (d) => delete intro(d).figure, /figure \(図\) か figureOmitted \(図を省く理由\) のどちらか一方/],
      ['both-figure', (d) => (intro(d).figureOmitted = '要らない'), /figure \(図\) か figureOmitted \(図を省く理由\) のどちらか一方/],
      ['figure-kind', (d) => (intro(d).figure.kind = 'pie'), /intro\.figure\.kind は flow \/ table のどれか/],
      ['figure-one', (d) => (intro(d).figure.items = intro(d).figure.items.slice(0, 1)), /intro\.figure\.items は 2〜8 個にします \(1 個\)/],
      ['table-no-note', (d) => {
        intro(d).figure.kind = 'table';
        delete intro(d).figure.items[0].note;
      }, /intro\.figure\.items\[0\]\.note がありません/],
      ['try-three', (d) => (intro(d).tryIt = Array(3).fill(intro(d).tryIt[0])), /intro\.tryIt \(手元で試すコマンド\) は 1〜2 個/],
      ['try-no-expect', (d) => delete intro(d).tryIt[0].expect, /intro\.tryIt\[0\] は command と expect/],
      ['no-sources', (d) => (intro(d).sources = []), /intro\.sources \(出典の URL の配列\) がありません/],
      ['http-source', (d) => (intro(d).sources[1] = 'http://curl.se/docs/manpage.html'), /intro\.sources\[1\] が https の URL ではありません/],
      ['rfc-no-section', (d) => (intro(d).sources[0] = 'https://www.rfc-editor.org/rfc/rfc9110'), /intro\.sources\[0\] の RFC は節まで指します/],
      ['unknown-field', (d) => (intro(d).goal = []), /知らない欄 \(intro\.goal\) です/],
      // 答えの漏れ: 穴埋めの正解 (別解も)。ヘッダー名は大文字と小文字を区別しないので小文字でも漏れ
      ['leak-command', (d) => (intro(d).tryIt[0].command = 'curl --head https://example.com/'), /intro に main-w1-l1-q1 の答え \(--head\) が書いてあります/],
      ['leak-header', (d) => intro(d).body.push('本文の形式は content-type で伝えます。'), /intro に main-w1-l1-q2 の答え \(Content-Type\) が書いてあります/],
      ['leak-figure', (d) => (intro(d).figure.items[0].note = 'application/json'), /intro に main-w1-l1-q2 の答え \(application\/json\) が書いてあります/],
    ];
    for (const [name, fn, re] of cases) {
      const r = checkFiles([mutate(name, fn)], opts);
      expect(r.ok, name).toBe(false);
      expect(r.lines.join('\n'), name).toMatch(re);
    }
    // 語の一部 (-I が -i や -Iv の中に、など) は漏れに数えない。別の語の一部だけが同じでも NG にしない
    const ok = checkFiles([mutate('word-edge', (d) => (intro(d).tryIt[0].command = 'curl -sIv https://example.com/'))], opts);
    expect(ok.lines.join('\n')).not.toMatch(/答え/);
  });

  it('穴埋めのよくある誤答 (blanks[].wrong) の決まりを 1 つずつ NG にする (数・形・正解と同じ・重なり・文の数)', async () => {
    const { checkFiles, readStages, readIds } = await import(pathToFileURL(SCRIPT).href);
    const opts = { stages: readStages(), courseIds: readIds('src/lib/route.ts', 'COURSES') };
    const w = (d: any, qi: number, bi = 0) => q(d, qi).blanks[bi].wrong;
    const cases: [string, (d: any) => void, RegExp][] = [
      ['no-wrong', (d) => delete q(d, 0).blanks[0].wrong, /main-w1-l1-q1: よくある誤答 \(blanks\[\]\.wrong\) を合わせて 2〜4 個書きます \(0 個\)/],
      ['one-wrong', (d) => w(d, 0).pop(), /main-w1-l1-q1: よくある誤答 .* \(1 個\)/],
      ['five-wrong', (d) => w(d, 1, 0).push(...['A', 'B', 'C', 'D'].map((x) => ({ answer: x, why: 'ちがう。' }))), /main-w1-l1-q2: よくある誤答 .* \(6 個\)/],
      ['not-array', (d) => (q(d, 0).blanks[0].wrong = { answer: '-i', why: 'x' }), /main-w1-l1-q1: blanks\[0\]\.wrong は誤答の配列にします/],
      ['no-why', (d) => delete w(d, 0)[0].why, /main-w1-l1-q1: blanks\[0\]\.wrong\[0\] は answer \(誤答\) と why/],
      ['same-as-right', (d) => (w(d, 0)[0].answer = '--head'), /main-w1-l1-q1: blanks\[0\]\.wrong\[0\] の誤答 \(--head\) が正解と同じです/],
      // ヘッダー名は大文字と小文字を区別しないので、小文字にしただけの正解は誤答にならない
      ['same-header-case', (d) => (w(d, 1, 0)[0].answer = 'content-type'), /main-w1-l1-q2: blanks\[0\]\.wrong\[0\] の誤答 \(content-type\) が正解と同じです/],
      ['dup-wrong', (d) => (w(d, 0)[1].answer = w(d, 0)[0].answer), /main-w1-l1-q1: blanks\[0\]\.wrong\[1\] の誤答 \(-i\) が重なっています/],
      ['why-three', (d) => (w(d, 0)[0].why = '一つ目。二つ目。三つ目。'), /main-w1-l1-q1: blanks\[0\]\.wrong\[0\]\.why は 2 文までにします/],
      ['unknown-field', (d) => (w(d, 0)[0].reason = 'x'), /知らない欄 \(blanks\[0\]\.wrong\[0\]\.reason\) です/],
    ];
    for (const [name, fn, re] of cases) {
      const r = checkFiles([mutate(name, fn)], opts);
      expect(r.ok, name).toBe(false);
      expect(r.lines.join('\n'), name).toMatch(re);
    }
  });

  it('検査が読む段とコースの id は、stages.ts と route.ts の正本と同じ', async () => {
    const mod = await import(pathToFileURL(SCRIPT).href);
    expect(mod.readStages()).toEqual(STAGES.map((s) => ({ id: s.id, week: s.week })));
    expect(mod.readIds('src/lib/route.ts', 'COURSES')).toEqual(COURSES.map((c) => c.id));
  });
});
