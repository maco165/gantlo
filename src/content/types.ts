// 問題データの型。JSON の検査は scripts/check-content.mjs が持ち、ここと同じ欄を見る。
// 欄の意味と例は docs/content-format.md にある。
import type { CourseId } from '../lib/route';

/** 穴埋めの空欄の中身の種類。header-name と media-type は大文字と小文字を区別せずに採点する (header-name は認証の方式の名前など、規格が大文字と小文字を区別しない語にも使う) */
export type BlankMatch = 'text' | 'header-name' | 'media-type';

/** 空欄 1 つぶんの正解 */
export type Blank = {
  /** 正解。どれか 1 つに一致すれば正解 (先頭が模範解答、残りは別解) */
  answers: string[];
  /** 省略すると text (大文字と小文字を区別する) */
  match?: BlankMatch;
  /** よくある誤答と、なぜ違うか。答えがどれかに当たれば (match の比べ方で) その why を出す */
  wrong?: WrongAnswer[];
};

/** 穴埋めのよくある誤答 1 つ。4 択の why と同じ考え方 */
export type WrongAnswer = { answer: string; why: string };

type QuestionBase = {
  id: string;
  prompt: string;
  explanation: string;
  /** 出典の https の URL (1 つ以上) */
  sources: string[];
};

/** コマンドの穴埋め。code の中の `{{blank}}` がちょうど 1 つ */
export type CommandQuestion = QuestionBase & {
  kind: 'command';
  tool: 'curl' | 'dig' | 'openssl';
  code: string;
  blanks: [Blank];
  /** 正解のあとに見せる実行結果の例 */
  output?: string;
};

/** HTTP のやり取りや JSON の穴埋め。code の中の `{{blank}}` が 1〜2 つで、blanks と同じ数 */
export type HttpQuestion = QuestionBase & {
  kind: 'http';
  /** 表示の見出しに使う */
  format: 'http' | 'json';
  code: string;
  blanks: [Blank] | [Blank, Blank];
};

export type OrderItem = { id: string; text: string };

/** 並べ替え。answer は items の id を正しい順に並べたもの (items の id をちょうど 1 回ずつ使う) */
export type OrderQuestion = QuestionBase & {
  kind: 'order';
  items: OrderItem[];
  answer: string[];
};

export type Choice = { id: string; text: string; why?: string };

/** 4 択。code があれば問題文の下に出す */
export type ChoiceQuestion = QuestionBase & {
  kind: 'choice';
  code?: { format: string; text: string };
  choices: Choice[];
  answer: string;
  /** true なら選択肢を混ぜない (位置に意味があるとき) */
  fixedOrder?: boolean;
};

export type LabStep = { text: string; command?: string };

/** 実習。手元で打って観察する。採点はせず、expected (観察できること) を見せる */
export type LabQuestion = QuestionBase & {
  kind: 'lab';
  steps: LabStep[];
  expected: string;
};

export type Question = CommandQuestion | HttpQuestion | OrderQuestion | ChoiceQuestion | LabQuestion;
export type QuestionKind = Question['kind'];

/** 要点の図。flow は矢印でつなぐ箱の並び、table は 2 列の表 (名前と意味) */
export type IntroFigure = { kind: 'flow' | 'table'; caption: string; items: { label: string; note?: string }[] };

/** 手元で試すコマンドと、期待する出力の要点 */
export type IntroTry = { command: string; expect: string };

/**
 * レッスンの要点。問題の前に読む。答えの文字列は書かない (考え方だけを書く)。
 * 図は figure か、要らない理由 (figureOmitted) のどちらか一方
 */
export type LessonIntro = {
  /** このレッスンで分かるようになること (ちょうど 3 行、動詞で終える) */
  goals: [string, string, string];
  /** 短い説明の段落 (合わせて 200〜400 字) */
  body: string[];
  figure?: IntroFigure;
  figureOmitted?: string;
  /** 手元で試すなら (1〜2 個) */
  tryIt?: IntroTry[];
  /** 出典の https の URL (1 つ以上) */
  sources: string[];
};

export type Lesson = {
  id: string;
  title: string;
  /** タブと検索の結果に出す短い題 (<title>)。題にサイト名を付けて 35 字を超えるときだけ書く (検査は scripts/check-content.mjs) */
  shortTitle?: string;
  course: CourseId;
  /** リクエストの旅の段 (src/content/stages.ts の id)。本編では必須、ほかのコースでは任意 */
  stage?: string;
  /** 問題の前に読む要点。問題データでは全レッスンが持つ (検査は scripts/check-content.mjs)。型が任意なのは、復習などで組み立てるレッスンのため */
  intro?: LessonIntro;
  questions: Question[];
};

/** 1 つの JSON ファイルの中身 (src/content/courses/<course>/*.json) */
export type LessonFile = { lessons: Lesson[] };
