import { findLesson } from '../content/index';
import { breadcrumbs } from '../lib/breadcrumbs';
import type { Route } from '../lib/route';

/**
 * 画面の上のパンくず (ホーム › コース › レッスン など)。並びの正本は src/lib/breadcrumbs.ts で、
 * 書き出す HTML の本文 (src/prerender/pages.ts) と JSON-LD の BreadcrumbList も同じ並び。ホームと知らない道では出さない
 */
export default function Breadcrumbs({ route }: { route: Route }) {
  const crumbs = breadcrumbs(route, route.name === 'lesson' ? findLesson(route.lessonId) : undefined);
  if (!crumbs) return null;
  return (
    <nav className="crumbs" aria-label="パンくずリスト">
      <ol>
        {crumbs.map((c, i) => (
          <li key={c.href}>{i < crumbs.length - 1 ? <a href={c.href}>{c.name}</a> : <span aria-current="page">{c.name}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}
