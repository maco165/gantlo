// 画面の題の正本。サイトの中で移ったときの document.title (src/App.tsx) と、
// 書き出す HTML の <title> (src/prerender/pages.ts) が同じものを使う (食い違わないように)
import { findLesson } from '../content/index';
import { COURSES, type PageName, type Route } from './route';
import { SITE_NAME, SITE_TAGLINE } from './site';

export const PAGE_TITLES: Record<PageName, string> = { plan: '計画 (Gantt)', review: '復習', progress: '進捗', glossary: '用語集', settings: '設定', about: 'このサイトについて' };

/** 画面の題 (ブラウザのタブと検索結果に出る)。ホームは null */
export function titleOf(route: Route): string | null {
  if (route.name === 'page') return PAGE_TITLES[route.page];
  if (route.name === 'course') return COURSES.find((c) => c.id === route.course)?.title ?? null;
  if (route.name === 'lesson') return findLesson(route.lessonId)?.title ?? 'ページが見つかりません';
  if (route.name === 'notFound') return 'ページが見つかりません';
  return null;
}

/** タブ・履歴・検索の結果に出る題 (サイト名つき) */
export function documentTitle(route: Route): string {
  return withSite(titleOf(route));
}

/** 画面の題にサイト名を付ける。null はホーム */
export function withSite(title: string | null): string {
  return title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ガントチャートで計画する ${SITE_TAGLINE}`;
}
