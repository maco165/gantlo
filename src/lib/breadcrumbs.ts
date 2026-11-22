// パンくず (ホーム › コース › レッスン など) の正本。画面の上の帯 (src/components/Breadcrumbs.tsx)、
// 書き出す HTML の本文と JSON-LD の BreadcrumbList (src/prerender/) が同じ並びを使う (階層が食い違わないように)
import type { Lesson } from '../content/types';
import { findTopic } from '../content/handbook';
import { HANDBOOK_TITLE, PAGE_TITLES } from './pageMeta';
import { COURSES, courseHref, handbookHref, homeHref, lessonHref, pageHref, type Route } from './route';

export type Crumb = { name: string; href: string };

export const HOME_CRUMB = 'ホーム';

/**
 * 経路のパンくず。最後が今のページ。ホームと知らない道は null (パンくずを出さない)。
 * レッスンは引けたものだけ (差し替えたレッスンでも作れるよう、引き方を渡せる)
 */
export function breadcrumbs(route: Route, lesson?: Pick<Lesson, 'id' | 'title' | 'course'>): Crumb[] | null {
  const home: Crumb = { name: HOME_CRUMB, href: homeHref };
  if (route.name === 'page') return [home, { name: PAGE_TITLES[route.page], href: pageHref(route.page) }];
  if (route.name === 'course') {
    const c = COURSES.find((x) => x.id === route.course);
    return c ? [home, { name: c.title, href: courseHref(c.id) }] : null;
  }
  if (route.name === 'handbook') {
    const index: Crumb = { name: HANDBOOK_TITLE, href: handbookHref() };
    if (route.topic === undefined) return [home, index];
    const t = findTopic(route.topic);
    return t ? [home, index, { name: t.title, href: handbookHref(t.id) }] : null;
  }
  if (route.name === 'lesson' && lesson && lesson.id === route.lessonId) {
    const c = COURSES.find((x) => x.id === lesson.course);
    return [home, ...(c ? [{ name: c.title, href: courseHref(c.id) }] : []), { name: lesson.title, href: lessonHref(lesson.id) }];
  }
  return null;
}
