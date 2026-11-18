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
import Home from './screens/Home';
import NotImplemented from './screens/NotImplemented';

const PAGE_TITLES: Record<PageName, string> = { plan: '計画 (Gantt)', review: '復習', progress: '進捗', glossary: '用語集', settings: '設定' };

/** 画面の題 (ブラウザのタブと検索結果に出る) */
export function titleOf(route: Route): string | null {
  if (route.name === 'page') return PAGE_TITLES[route.page];
  if (route.name === 'course') return COURSES.find((c) => c.id === route.course)?.title ?? null;
  return null;
}

export default function App() {
  const route = useRoute();
  const title = titleOf(route);
  // スマホのメニューは、別の画面へ移ったら閉じる (開いたままだと、移った先の画面が見えない)
  const [navOpen, setNavOpen] = useState(false);
  const routeKey = JSON.stringify(route);
  useEffect(() => setNavOpen(false), [routeKey]);
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ガントチャートで計画する ${SITE_TAGLINE}`;
  }, [title]);

  let screen;
  if (route.name === 'page') screen = <NotImplemented title={PAGE_TITLES[route.page]} request={`GET /${route.page}`} />;
  else if (route.name === 'course') screen = <NotImplemented title={title ?? ''} request={`GET /course/${route.course}`} />;
  else screen = <Home />;

  return (
    <InternationalizationProvider locale="ja-JP" messages={{ 'ja-JP': jaJP }}>
      <Theme theme={gothicTheme} mode="dark">
        <AppShell contentPadding={0} variant="section" sideNav={<AppSideNav route={route} />} mobileNav={{ hasToggle: false, isOpen: navOpen, onOpenChange: setNavOpen, content: <AppMobileNav route={route} /> }}>
          <MobileBar />
          {screen}
        </AppShell>
      </Theme>
    </InternationalizationProvider>
  );
}
