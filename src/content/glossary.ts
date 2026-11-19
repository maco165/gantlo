// 用語集のデータを読む。画面 (screens/Glossary.tsx) と書き出し (prerender/pages.ts) が同じものを使う
import { sortTerms, type GlossaryTerm } from '../lib/glossary';
import data from './glossary.json';

export const TERMS: readonly GlossaryTerm[] = (data as { terms: GlossaryTerm[] }).terms;

/** 11 の規格 (学ぶ順) と、ほかの語 (読みの順) */
export const SORTED = sortTerms(TERMS);
