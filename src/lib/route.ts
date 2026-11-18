import { useEffect, useState } from 'react';

// 経路は # の無い URL (/gantlo/plan/ など) で、History API で切り替える。
// 検索エンジンは # の後ろを別のページとして扱わないため。
export type PageName = 'plan' | 'review' | 'progress' | 'glossary' | 'settings';
export type CourseId = 'main' | 'spring' | 'tech-history' | 'mgmt-history' | 'security';
export type Route = { name: 'home' } | { name: 'page'; page: PageName } | { name: 'course'; course: CourseId } | { name: 'notFound' };

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

/** URL の道 (pathname) から画面を決める。知らない道は 404 にする (ホームの中身を別の URL で重ねて出さない) */
export function parseRoute(pathname: string): Route {
  // 末尾の index.html を落とし、末尾の / を揃えてから比べる (/gantlo・/gantlo/・/gantlo/index.html を同じに扱う)
  const trimmed = pathname.replace(/\/index\.html$/, '/');
  const p = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  const rest = p.startsWith(BASE) ? p.slice(BASE.length) : p.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts.length === 1 && (PAGES as readonly string[]).includes(parts[0])) return { name: 'page', page: parts[0] as PageName };
  if (parts.length === 2 && parts[0] === 'course') {
    const course = COURSES.find((c) => c.id === parts[1]);
    if (course) return { name: 'course', course: course.id };
  }
  return { name: 'notFound' };
}

export const homeHref = BASE;
export const pageHref = (page: PageName) => `${BASE}${page}/`;
export const courseHref = (course: CourseId) => `${BASE}course/${course}/`;

/**
 * 同じサイトの中のリンクなら、そのリンクを返す (ページを読み直さずに画面だけ切り替える)。
 * 修飾キー付き・左以外のボタン・新しいタブ・保存・別のサイト・置き場所の外のリンクは奪わず null を返す
 */
export function isInternalClick(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE)) return null;
  return a;
}

/** 画面を移ったら先頭へ戻す。AppShell (height は fill) では window ではなく main の箱がスクロールする */
export function scrollToTop() {
  const main = document.getElementById('astryx-app-shell-main');
  if (main) main.scrollTo(0, 0);
  else window.scrollTo(0, 0);
}

/**
 * 今の画面と、画面を移る操作の回数 (nav) を返す。nav は同じ画面のリンクを押したときも、戻るでも増える。
 * スマホのメニューは nav が変わったら閉じる
 */
export function useRoute(): { route: Route; nav: number } {
  const [state, setState] = useState(() => ({ route: parseRoute(window.location.pathname), nav: 0 }));
  useEffect(() => {
    const go = (pathname: string) => setState((s) => ({ route: parseRoute(pathname), nav: s.nav + 1 }));
    const onPop = () => go(window.location.pathname);
    const onClick = (e: MouseEvent) => {
      const a = isInternalClick(e);
      if (!a) return;
      e.preventDefault();
      const url = new URL(a.href, window.location.href);
      if (url.pathname !== window.location.pathname) window.history.pushState(null, '', url.pathname);
      go(url.pathname);
      scrollToTop();
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return state;
}
