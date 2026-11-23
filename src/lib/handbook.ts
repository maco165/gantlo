// ハンドブック: 規格ごとに、curl の実例と出力で流れを説明する読み物。データの正本は src/content/handbook/
// (目録 topics.json と、項目ごとの本文 sections/<id>.json)。
// 様式は docs/content-format.md、検査は scripts/check-content.mjs (npm run check:content)。

/** 一覧の画面と書き出す HTML の説明の文 (同じ文を使う) */
export const HANDBOOK_LEAD =
  '規格ごとに、curl で実際のやり取りを見ながら流れを説明する読み物です。問題を解く前の下調べにも、間違えたあとの見直しにも使えます。どの節にも、RFC などの一次情報の出典を節まで付けています。';

/** 読み方の文 (一覧の画面と書き出す HTML で同じ文を使う) */
export const HANDBOOK_HOWTO =
  '各節は、説明・試すコマンド・出力の例・出典の順に並びます。コマンドは手元の端末にそのまま貼って試せます。送り先は example.com・httpbin.org など、試しに使うための公開のサーバーだけです。出力の日付やヘッダーの並びは、試す日と経路で変わります。';

export type HandbookSource = { label: string; url: string };

export type HandbookSection = {
  heading: string;
  /** 段落 (1 つ以上) */
  text: string[];
  /** 試すコマンド */
  code?: { language: string; text: string };
  /** そのコマンドの出力の例 (code があるときだけ) */
  output?: string;
  /** 出力の読み方の添え書き (省いた行・変わる値など) */
  note?: string;
  /** この節の出典 (1 つ以上、https)。RFC は節まで指す */
  sources: HandbookSource[];
};

/** 項目の目録 (題・要約・つながり)。ホーム・メニュー・題・パンくずと、用語集・レッスンからのリンクが使う */
export type HandbookTopicMeta = {
  /** 英小文字・数字・- 。道 /handbook/<id>/ に使う */
  id: string;
  /** 扱う規格 (用語集の 11 の規格の語の id) */
  standard: string;
  title: string;
  /** 一覧と検索の説明に使う短い要約 */
  summary: string;
  /** 関係するレッスンの id (レッスンの側にも、このページへのリンクを出す) */
  lessons: string[];
  /** 本文に出てくる用語集の語の id (用語集の側にも、このページへのリンクを出す) */
  terms: string[];
};

/** 本文まで含む項目 (書き出しと画面の本文が使う) */
export type HandbookTopic = HandbookTopicMeta & { sections: HandbookSection[] };

/** 項目の出典を、節の出典から重ならずに集める (並びは最初に出た順) */
export function topicSources(t: Pick<HandbookTopic, 'sections'>): HandbookSource[] {
  const seen = new Map<string, HandbookSource>();
  for (const s of t.sections) for (const src of s.sources) if (!seen.has(src.url)) seen.set(src.url, src);
  return [...seen.values()];
}

/** 語の id から、その語が出てくる項目 */
export const topicsForTerm = <T extends HandbookTopicMeta>(topics: readonly T[], termId: string) => topics.filter((t) => t.terms.includes(termId));

/** レッスンの id から、そのレッスンに関係する項目 */
export const topicsForLesson = <T extends HandbookTopicMeta>(topics: readonly T[], lessonId: string) => topics.filter((t) => t.lessons.includes(lessonId));
