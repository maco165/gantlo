// ハンドブックのデータを読む。目録 (handbook/topics.json) は小さいので、題・メニュー・リンクのためにすぐ読む。
// 項目の本文 (handbook/sections/<id>.json) は、その項目を開いたときに読む (最初の JS を軽くするため)。
// 書き出し (prerender/pages.ts) は全部の本文を content/handbook-all.ts から読む。
import type { HandbookSection, HandbookTopicMeta } from '../lib/handbook';
import meta from './handbook/topics.json';

export const TOPICS: readonly HandbookTopicMeta[] = (meta as { topics: HandbookTopicMeta[] }).topics;

export const findTopic = (id: string) => TOPICS.find((t) => t.id === id);

const SECTION_FILES = import.meta.glob<{ sections: HandbookSection[] }>('./handbook/sections/*.json', { import: 'default' });

const cache = new Map<string, Promise<HandbookSection[] | undefined>>();

/** 項目の本文を読む。同じ項目には同じ Promise を返す (React の use で待つため)。ファイルが無ければ undefined */
export function loadSections(id: string): Promise<HandbookSection[] | undefined> {
  let p = cache.get(id);
  if (!p) {
    const load = SECTION_FILES[`./handbook/sections/${id}.json`];
    p = load ? load().then((f) => f.sections) : Promise.resolve(undefined);
    cache.set(id, p);
  }
  return p;
}
