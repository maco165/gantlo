// 画面の題の正本。サイトの中で移ったときの document.title (src/App.tsx) と、
// 書き出す HTML の <title> (src/prerender/pages.ts) が同じものを使う (食い違わないように)
import { findLessonMeta as findLesson } from '../content/catalog';
import { findTopic } from '../content/handbook';
import type { Lesson } from '../content/types';
import { COURSES, type PageName, type Route } from './route';
import { SITE_NAME, SITE_TAGLINE } from './site';

/** ハンドブックの一覧の題 (メニュー・パンくず・<title> で同じもの) */
export const HANDBOOK_TITLE = 'ハンドブック';

export const PAGE_TITLES: Record<PageName, string> = { plan: '計画 (Gantt)', review: '復習', exam: '模擬試験', progress: '進捗', glossary: '用語集', settings: '設定', about: 'このサイトについて' };

/** 画面の題 (ブラウザのタブと検索結果に出る)。ホームは null */
export function titleOf(route: Route): string | null {
  if (route.name === 'page') return PAGE_TITLES[route.page];
  if (route.name === 'course') return COURSES.find((c) => c.id === route.course)?.title ?? null;
  if (route.name === 'lesson') return findLesson(route.lessonId)?.title ?? 'ページが見つかりません';
  if (route.name === 'handbook') return route.topic === undefined ? HANDBOOK_TITLE : (findTopic(route.topic)?.title ?? 'ページが見つかりません');
  if (route.name === 'notFound') return 'ページが見つかりません';
  return null;
}

/** <title> の字数の上限 (検索の結果で切られない長さ)。長いレッスンの題は shortTitle に縮める (scripts/check-content.mjs が見る) */
export const TITLE_MAX = 35;

/** タブ・履歴・検索の結果に出る題 (サイト名つき)。レッスンは短い題があればそちら (画面の見出しは題のまま) */
export function documentTitle(route: Route): string {
  if (route.name === 'lesson') {
    const lesson = findLesson(route.lessonId);
    if (lesson) return lessonDocumentTitle(lesson);
  }
  return withSite(titleOf(route));
}

/** レッスンの <title>。書き出す HTML (差し替えたレッスンでも引ける) と画面のタブが同じものを使う */
export const lessonDocumentTitle = (lesson: Pick<Lesson, 'title' | 'shortTitle'>): string => withSite(lesson.shortTitle ?? lesson.title);

/** 画面の題にサイト名を付ける。null はホーム */
export function withSite(title: string | null): string {
  return title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ガントで計画する ${SITE_TAGLINE}`;
}
