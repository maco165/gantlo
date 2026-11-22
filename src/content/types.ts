// 問題データの型。JSON の検査は scripts/check-content.mjs が持ち、ここと同じ欄を見る。
// 欄の意味と例は docs/content-format.md にある。
import type { CourseId } from '../lib/route';

/** 穴埋めの空欄の中身の種類。header-name と media-type は大文字と小文字を区別せずに採点する */
export type BlankMatch = 'text' | 'header-name' | 'media-type';

/** 空欄 1 つぶんの正解 */
export type Blank = {
  /** 正解。どれか 1 つに一致すれば正解 (先頭が模範解答、残りは別解) */
  answers: string[];
  /** 省略すると text (大文字と小文字を区別する) */
  match?: BlankMatch;
};

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

export type Lesson = {
  id: string;
  title: string;
  /** タブと検索の結果に出す短い題 (<title>)。題にサイト名を付けて 35 字を超えるときだけ書く (検査は scripts/check-content.mjs) */
  shortTitle?: string;
  course: CourseId;
  /** リクエストの旅の段 (src/content/stages.ts の id)。本編では必須、ほかのコースでは任意 */
  stage?: string;
  questions: Question[];
};

/** 1 つの JSON ファイルの中身 (src/content/courses/<course>/*.json) */
export type LessonFile = { lessons: Lesson[] };
