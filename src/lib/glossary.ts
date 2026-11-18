// 用語集: 11 の規格と、問題に出る用語の短い説明。データの正本は src/content/glossary.json。
// 様式と、問題の PR が入ったあとにレッスンへのリンクを足す手順は docs/content-format.md にある。

export type GlossarySource = { label: string; url: string };

export type GlossaryTerm = {
  /** 英小文字・数字・- 。画面の #term-<id> にも使う */
  id: string;
  term: string;
  /** 別名・略さない名前・英語の名前 (検索で引ける) */
  aliases?: string[];
  /** 11 の規格のときだけ、学ぶ順の番号 (1〜11)。10 は OAuth 2.0 と JWT の 2 語 */
  standard?: number;
  /** 短い説明 (1〜3 文) */
  description: string;
  /** 一次情報の出典 (1 つ以上、https)。RFC は節まで指す */
  sources: GlossarySource[];
  /** 語が出てくるレッスンの id。main にあるレッスンだけを書く (無ければ空) */
  lessons: string[];
};

/** 11 の規格の数 (持ち主の文書の「押さえるべき規格一覧」の行の数) */
export const STANDARD_COUNT = 11;

/**
 * 検索のための形にそろえる。NFKC で全角英数・半角カナをそろえ、大文字と小文字を区別せず、ひらがなをカタカナにする。
 * ハイフン・「/」・「.」は英数字に挟まれたときだけ消し (content-type と contenttype、HTTP/2 と http2、TLS 1.3 の 1.3 と 13)、
 * 語の頭のハイフン (curl の -I など) は残す。中黒は消す (ＨＴＴＰ と http、ﾘｿｰｽ と りそーす と リソース を同じに扱う)
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/(?<=[a-z0-9])[-‐./](?=[a-z0-9])/g, '')
    .replace(/・/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 名前の比べる形。そろえた形と、空白を抜いた形 (TLS 1.3 を TLS1.3 でも、OAuth 2.0 を OAuth2 でも引ける) */
function nameForms(name: string): string[] {
  const n = normalizeText(name);
  const compact = n.replace(/ /g, '');
  return compact === n ? [n] : [n, compact];
}

/** 用語・別名のどれかと語が完全一致なら 0、先頭一致なら 1、部分一致なら 2、当たらなければ 3 */
function nameRank(names: string[], words: string[]): number {
  let best = 3;
  for (const w of words) {
    for (const n of names) {
      if (n === w) return 0;
      if (n.startsWith(w)) best = Math.min(best, 1);
      else if (n.includes(w)) best = Math.min(best, 2);
    }
  }
  return best;
}

/**
 * 用語・別名・説明から探す。空白で区切った語をすべて含むものを、
 * 用語か別名に当たるものを先に、説明だけに当たるものを後に並べる (同じ順位では元の並び)
 */
export function searchTerms<T extends GlossaryTerm>(terms: readonly T[], query: string): T[] {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...terms];
  const hits: { t: T; rank: number; i: number }[] = [];
  terms.forEach((t, i) => {
    const names = [t.term, ...(t.aliases ?? [])].flatMap(nameForms);
    const all = `${names.join(' ')} ${normalizeText(t.description)}`;
    if (!words.every((w) => all.includes(w))) return;
    hits.push({ t, rank: nameRank(names, words), i });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map((h) => h.t);
}

/** 画面の並び: 11 の規格は学ぶ順、ほかの語は読みの順 */
export function sortTerms<T extends GlossaryTerm>(terms: readonly T[]): { standards: T[]; others: T[] } {
  const standards = terms.filter((t) => t.standard !== undefined).sort((a, b) => a.standard! - b.standard!);
  const others = terms.filter((t) => t.standard === undefined).sort((a, b) => a.term.localeCompare(b.term, 'ja'));
  return { standards, others };
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const isHttpsUrl = (v: unknown): boolean => {
  if (!isNonEmptyString(v)) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

const KEYS = new Set(['id', 'term', 'aliases', 'standard', 'description', 'sources', 'lessons']);

/**
 * 用語集のデータの検査。違反を文で返す (空なら OK)。
 * id の形と重なり・用語と別名の重なり (検索の形にそろえて比べる)・https の出典・RFC の節・実在するレッスン・11 の規格がそろうこと
 */
export function validateGlossary(data: unknown, knownLessonIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const terms = (data as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(terms)) return ['terms の配列がありません'];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const standards = new Set<number>();
  terms.forEach((raw: unknown, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`#${i}: 語がオブジェクトではありません`);
      return;
    }
    const t = raw as Record<string, unknown>;
    const where = isNonEmptyString(t.id) ? t.id : `#${i}`;
    for (const k of Object.keys(t)) if (!KEYS.has(k)) errors.push(`${where}: ${k} という欄は使いません (打ち間違いでないか確かめる)`);
    if (!isNonEmptyString(t.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.id)) errors.push(`${where}: id は英小文字・数字・- にします`);
    else if (ids.has(t.id)) errors.push(`${where}: id が重複しています`);
    else ids.add(t.id);
    if (!isNonEmptyString(t.term)) errors.push(`${where}: term がありません`);
    if (!isNonEmptyString(t.description)) errors.push(`${where}: description がありません`);
    if (t.aliases !== undefined && !(Array.isArray(t.aliases) && t.aliases.every(isNonEmptyString))) errors.push(`${where}: aliases は文字列の配列にします`);
    if (t.standard !== undefined) {
      if (!Number.isInteger(t.standard) || (t.standard as number) < 1 || (t.standard as number) > STANDARD_COUNT) errors.push(`${where}: standard は 1〜${STANDARD_COUNT} の整数にします`);
      else standards.add(t.standard as number);
    }
    if (!Array.isArray(t.sources) || t.sources.length === 0) errors.push(`${where}: sources が空です (一次情報の出典を 1 つ以上)`);
    else {
      for (const s of t.sources as { label?: unknown; url?: unknown }[]) {
        if (!isNonEmptyString(s?.label) || !isHttpsUrl(s?.url)) {
          errors.push(`${where}: sources は label と https の url を持ちます`);
          continue;
        }
        // 書き出す HTML の属性に入るので、空白・" < > を持たない (書き出しでも escape する)
        if (/[\s"<>]/.test(s.url as string)) errors.push(`${where}: url に空白・" < > を入れません (${String(s.url)})`);
        // RFC は節まで指す (https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2 の形)
        const url = s.url as string;
        if (new URL(url).hostname === 'www.rfc-editor.org' && !/^https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+#section-\d+(?:\.\d+)*$/.test(url)) errors.push(`${where}: RFC の出典は節まで指します (${url})`);
      }
      const urls = (t.sources as { url?: unknown }[]).map((s) => s?.url);
      if (new Set(urls).size !== urls.length) errors.push(`${where}: sources に同じ URL が重なっています`);
    }
    if (!Array.isArray(t.lessons)) errors.push(`${where}: lessons は配列にします (出てくるレッスンが main に無ければ空)`);
    else {
      for (const l of t.lessons) if (!knownLessonIds.has(l as string)) errors.push(`${where}: lessons の ${String(l)} というレッスンはありません`);
      if (new Set(t.lessons).size !== t.lessons.length) errors.push(`${where}: lessons に同じレッスンが重なっています`);
    }
    for (const n of [t.term, ...(Array.isArray(t.aliases) ? t.aliases : [])]) {
      if (!isNonEmptyString(n)) continue;
      const key = normalizeText(n);
      const owner = names.get(key);
      if (owner && owner !== where) errors.push(`${where}: 「${n}」は ${owner} と重なっています`);
      else names.set(key, where);
    }
  });
  for (let n = 1; n <= STANDARD_COUNT; n++) if (!standards.has(n)) errors.push(`11 の規格の ${n} 番 (standard: ${n}) の語がありません`);
  return errors;
}
