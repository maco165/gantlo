import { useEffect, useState } from 'react';

// 経路は # の無い URL (/gantlo/plan/ など) で、History API で切り替える。
// 検索エンジンは # の後ろを別のページとして扱わないため。
export type PageName = 'plan' | 'review' | 'progress' | 'glossary' | 'settings';
export type CourseId = 'main' | 'spring' | 'tech-history' | 'mgmt-history' | 'security';
export type Route = { name: 'home' } | { name: 'page'; page: PageName } | { name: 'course'; course: CourseId };

/** サイトの置き場所 (vite の base。/gantlo/) */
export const BASE = import.meta.env.BASE_URL;

const PAGES: readonly PageName[] = ['plan', 'review', 'progress', 'glossary', 'settings'];
export const COURSES: readonly { id: CourseId; title: string }[] = [
  { id: 'main', title: '本編 4 週' },
  { id: 'spring', title: 'Spring Boot の流れ' },
  { id: 'tech-history', title: '技術の歴史' },
  { id: 'mgmt-history', title: '管理の歴史' },
  { id: 'security', title: 'セキュリティ' },
];

/** URL の道 (pathname) から画面を決める。知らない道はホームにする */
export function parseRoute(pathname: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1 && (PAGES as readonly string[]).includes(parts[0])) return { name: 'page', page: parts[0] as PageName };
  if (parts.length === 2 && parts[0] === 'course') {
    const course = COURSES.find((c) => c.id === parts[1]);
    if (course) return { name: 'course', course: course.id };
  }
  return { name: 'home' };
}

export const homeHref = BASE;
export const pageHref = (page: PageName) => `${BASE}${page}/`;
export const courseHref = (course: CourseId) => `${BASE}course/${course}/`;

/** 同じサイトの中のリンクは、ページを読み直さずに画面だけ切り替える */
function isInternalClick(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE)) return null;
  return a;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    const onClick = (e: MouseEvent) => {
      const a = isInternalClick(e);
      if (!a) return;
      e.preventDefault();
      const url = new URL(a.href, window.location.href);
      if (url.pathname !== window.location.pathname) window.history.pushState(null, '', url.pathname);
      setRoute(parseRoute(url.pathname));
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return route;
}
