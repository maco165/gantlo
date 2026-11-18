import { AppShell } from '@astryxdesign/core/AppShell';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import jaJP from '@astryxdesign/core/locales/ja-JP.generated.js';
import { Theme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';
import { useEffect, useState } from 'react';
import AppSideNav, { AppMobileNav } from './components/AppSideNav';
import MobileBar from './components/MobileBar';
import { COURSES, useRoute, type PageName, type Route } from './lib/route';
import { SITE_NAME, SITE_TAGLINE } from './lib/site';
import { NOT_FOUND, NOT_IMPLEMENTED } from './lib/status';
import Home from './screens/Home';
import StatusPage from './screens/StatusPage';

const PAGE_TITLES: Record<PageName, string> = { plan: '計画 (Gantt)', review: '復習', progress: '進捗', glossary: '用語集', settings: '設定' };

/** 画面の題 (ブラウザのタブと検索結果に出る)。ホームは null */
export function titleOf(route: Route): string | null {
  if (route.name === 'page') return PAGE_TITLES[route.page];
  if (route.name === 'course') return COURSES.find((c) => c.id === route.course)?.title ?? null;
  if (route.name === 'notFound') return 'ページが見つかりません';
  return null;
}

export default function App() {
  const { route, nav } = useRoute();
  const title = titleOf(route);
  // スマホのメニューは、リンクを押したら閉じる (同じ画面のリンクでも、戻るでも)
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [nav]);
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ガントチャートで計画する ${SITE_TAGLINE}`;
  }, [title]);

  let screen;
  if (route.name === 'page') screen = <StatusPage title={PAGE_TITLES[route.page]} request={`GET /${route.page}`} status={NOT_IMPLEMENTED} />;
  else if (route.name === 'course') screen = <StatusPage title={title ?? ''} request={`GET /course/${route.course}`} status={NOT_IMPLEMENTED} />;
  else if (route.name === 'notFound') screen = <StatusPage title={title ?? ''} request={`GET ${window.location.pathname}`} status={NOT_FOUND} />;
  else screen = <Home />;

  return (
    <InternationalizationProvider locale="ja-JP" messages={{ 'ja-JP': jaJP }}>
      <Theme theme={gothicTheme} mode="dark">
        <AppShell
          contentPadding={0}
          variant="section"
          sideNav={<AppSideNav route={route} />}
          mobileNav={{ hasToggle: false, isOpen: navOpen, onOpenChange: setNavOpen, content: <AppMobileNav route={route} /> }}
        >
          <MobileBar />
          {screen}
        </AppShell>
      </Theme>
    </InternationalizationProvider>
  );
}
