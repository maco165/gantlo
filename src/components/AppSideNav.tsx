import { MobileNav } from '@astryxdesign/core/MobileNav';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { AdjustmentsHorizontalIcon, ArrowPathIcon, BookOpenIcon, ChartBarIcon, ClipboardDocumentCheckIcon, InformationCircleIcon, QueueListIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import { useLayoutEffect, useRef } from 'react';
import { COURSES, courseHref, homeHref, pageHref, type Route } from '../lib/route';
import { REPO_URL, SITE_NAME, SITE_TAGLINE } from '../lib/site';
import { GitHubMark } from './RepoLink';

const Logo = () => <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={24} height={24} alt="" aria-hidden="true" />;
const heading = <SideNavHeading heading={SITE_NAME} subheading={SITE_TAGLINE} icon={<Logo />} headingHref={homeHref} />;

/** メニューの項目。PC の SideNav とスマホの MobileNav で同じものを使う (下端の「このサイト」は SiteItems) */
function NavItems({ route }: { route: Route }) {
  const isPage = (p: string) => route.name === 'page' && route.page === p;
  return (
    <>
      <SideNavSection title="メニュー" isHeaderHidden>
        <SideNavItem label="学習" icon={QueueListIcon} href={homeHref} isSelected={route.name === 'home'} />
        <SideNavItem label="計画 (Gantt)" icon={TableCellsIcon} href={pageHref('plan')} isSelected={isPage('plan')} />
        <SideNavItem label="復習" icon={ArrowPathIcon} href={pageHref('review')} isSelected={isPage('review')} />
        <SideNavItem label="模擬試験" icon={ClipboardDocumentCheckIcon} href={pageHref('exam')} isSelected={isPage('exam')} />
        <SideNavItem label="進捗" icon={ChartBarIcon} href={pageHref('progress')} isSelected={isPage('progress')} />
        <SideNavItem label="用語集" icon={BookOpenIcon} href={pageHref('glossary')} isSelected={isPage('glossary')} />
        <SideNavItem label="設定" icon={AdjustmentsHorizontalIcon} href={pageHref('settings')} isSelected={isPage('settings')} />
      </SideNavSection>
      <SideNavSection title="コース">
        {COURSES.map((c) => (
          <SideNavItem key={c.id} label={c.title} href={courseHref(c.id)} isSelected={route.name === 'course' && route.course === c.id} />
        ))}
      </SideNavSection>
    </>
  );
}

/** メニューの下端に固定する 2 つ (kcna-dojo と同じ並び) */
function SiteItems({ route }: { route: Route }) {
  return (
    <SideNavSection title="このサイト" isHeaderHidden>
      <SideNavItem label="このサイトについて" icon={InformationCircleIcon} href={pageHref('about')} isSelected={route.name === 'page' && route.page === 'about'} />
      <SideNavItem label="GitHub のリポジトリ" icon={() => <GitHubMark size={20} />} href={REPO_URL} />
    </SideNavSection>
  );
}

/** PC の左のメニュー (常に出す) */
export default function AppSideNav({ route }: { route: Route }) {
  return (
    <SideNav header={heading} footer={<SiteItems route={route} />}>
      <NavItems route={route} />
    </SideNav>
  );
}

/**
 * スマホのメニューの中身。MobileNav には footer が無いので、「このサイト」の 2 つは CSS (.mobile-nav-body__foot) で下端に留める。
 * 下端に留めた 2 つの高さを --nav-foot-h に入れ、一覧のリンクの scroll-margin-bottom に使う
 * (Tab で進んだ手元の行が、スクロールしたとき下端の 2 つの下に隠れないように)。
 * 中身が描かれたときに測るよう、MobileNav の中の部品で測る
 */
function MobileNavBody({ route }: { route: Route }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const foot = footRef.current;
    if (!body || !foot) return;
    const sync = () => body.style.setProperty('--nav-foot-h', `${foot.offsetHeight}px`);
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(foot);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="mobile-nav-body" ref={bodyRef}>
      <NavItems route={route} />
      <div className="mobile-nav-body__foot" ref={footRef}>
        <SiteItems route={route} />
      </div>
    </div>
  );
}

/** スマホのメニュー。必ず左から開く (side="start") */
export function AppMobileNav({ route }: { route: Route }) {
  return (
    <MobileNav side="start" header={heading}>
      <MobileNavBody route={route} />
    </MobileNav>
  );
}
