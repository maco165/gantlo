// このサイトについての画面 (/gantlo/about/) の文の正本。画面 (src/screens/About.tsx) と、
// 書き出す HTML の本文 (src/prerender/pages.ts) が同じものを使う (食い違わないように)
import { STORAGE_KEY } from './progress';
import { SITE_NAME } from './site';

/** サイトの説明 (画面の見出しの下の段落) */
export const ABOUT_LEAD = [
  `${SITE_NAME} は、API と HTTP の基礎 (HTTP・URI・JSON・DNS・TLS・REST・OAuth など) を、curl や HTTP の穴埋め・4 択・並べ替えの問題で学ぶ、個人が作った学習サイトです。学ぶコースと順を選ぶとガントチャートで計画を引きます。`,
  '資格の試験の対策のサイトではなく、試験の問題は扱いません。',
];

/** ソースコードのカードの文 */
export const ABOUT_SOURCE = 'サイトのコードと問題のデータは、すべて GitHub で公開しています。';

/** 問題の誤りを知らせるカードの文 */
export const ABOUT_ISSUE =
  '問題は RFC や公式の文書などの一次情報で確かめて書いていますが、誤りがあれば Issue で知らせてください。問題の id (例: main-w1-l1-q1) を添えると早く直せます。';

/** 知っておくこと (ライセンスは画面でリンクを付けるので別に持つ) */
export const ABOUT_NOTES: readonly { label: string; text: string }[] = [
  { label: '記録の置き場所', text: `進み具合と計画と設定は、このブラウザの localStorage (キー ${STORAGE_KEY}) にだけ残り、サーバーには送りません。端末を変えるときは設定の画面で書き出して読み込みます。` },
  { label: 'AI に聞く', text: '問題の下のリンクは、問題文を入れた Claude / ChatGPT を新しいタブで開くだけです。答える前のリンクには正解と解説を入れません。送るかどうかは開いた先で決めます。' },
  { label: '問題について', text: '各問の解説の下と用語集に、RFC (節まで) などの一次情報の出典を付けています。' },
];

/** ライセンスの名前 (リポジトリの LICENSE と同じ) */
export const LICENSE_NAME = 'MIT';
