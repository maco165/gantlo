// ハンドブックの全部の本文 (書き出し prerender/pages.ts と検査が使う)。画面の JS からは読まない
import type { HandbookSection, HandbookTopic } from '../lib/handbook';
import { TOPICS } from './handbook';

const FILES = import.meta.glob<{ sections: HandbookSection[] }>('./handbook/sections/*.json', { eager: true, import: 'default' });

/** 目録の順に、本文まで含めた項目。本文のファイルが無い項目は sections が空 (check:content が NG にする) */
export const HANDBOOK: readonly HandbookTopic[] = TOPICS.map((t) => ({ ...t, sections: FILES[`./handbook/sections/${t.id}.json`]?.sections ?? [] }));
