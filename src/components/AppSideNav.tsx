import { MobileNav } from '@astryxdesign/core/MobileNav';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Text } from '@astryxdesign/core/Text';
import { AdjustmentsHorizontalIcon, ArrowPathIcon, BookOpenIcon, ChartBarIcon, CodeBracketIcon, QueueListIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import { COURSES, courseHref, homeHref, pageHref, type Route } from '../lib/route';
import { REPO_URL, SITE_NAME, SITE_TAGLINE } from '../lib/site';

const Logo = () => <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={24} height={24} alt="" aria-hidden="true" />;
const soon = <Text type="supporting">準備中</Text>;
const heading = <SideNavHeading heading={SITE_NAME} subheading={SITE_TAGLINE} icon={<Logo />} headingHref={homeHref} />;

/** メニューの項目。PC の SideNav とスマホの MobileNav で同じものを使う */
function NavItems({ route }: { route: Route }) {
  const isPage = (p: string) => route.name === 'page' && route.page === p;
  return (
    <>
      <SideNavSection title="メニュー" isHeaderHidden>
        <SideNavItem label="学習" icon={QueueListIcon} href={homeHref} isSelected={route.name === 'home'} />
        <SideNavItem label="計画 (Gantt)" icon={TableCellsIcon} href={pageHref('plan')} isSelected={isPage('plan')} endContent={soon} />
        <SideNavItem label="復習" icon={ArrowPathIcon} href={pageHref('review')} isSelected={isPage('review')} endContent={soon} />
        <SideNavItem label="進捗" icon={ChartBarIcon} href={pageHref('progress')} isSelected={isPage('progress')} endContent={soon} />
        <SideNavItem label="用語集" icon={BookOpenIcon} href={pageHref('glossary')} isSelected={isPage('glossary')} endContent={soon} />
        <SideNavItem label="設定" icon={AdjustmentsHorizontalIcon} href={pageHref('settings')} isSelected={isPage('settings')} endContent={soon} />
      </SideNavSection>
      <SideNavSection title="コース">
        {COURSES.map((c) => (
          <SideNavItem key={c.id} label={c.title} href={courseHref(c.id)} isSelected={route.name === 'course' && route.course === c.id} endContent={soon} />
        ))}
      </SideNavSection>
      <SideNavSection title="このサイト" isHeaderHidden>
        <SideNavItem label="GitHub のリポジトリ" icon={CodeBracketIcon} href={REPO_URL} />
      </SideNavSection>
    </>
  );
}

/** PC の左のメニュー (常に出す) */
export default function AppSideNav({ route }: { route: Route }) {
  return (
    <SideNav header={heading}>
      <NavItems route={route} />
    </SideNav>
  );
}

/** スマホのメニュー。必ず左から開く (side="start") */
export function AppMobileNav({ route }: { route: Route }) {
  return (
    <MobileNav side="start" header={heading}>
      <NavItems route={route} />
    </MobileNav>
  );
}
