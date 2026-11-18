import { AppShell } from '@astryxdesign/core/AppShell';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import jaJP from '@astryxdesign/core/locales/ja-JP.generated.js';
import { Theme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';
import { useEffect } from 'react';
import AppSideNav, { AppMobileNav } from './components/AppSideNav';
import MobileBar from './components/MobileBar';
import { findLesson } from './content/index';
import { COURSES, useRoute, type PageName, type Route } from './lib/route';
import { SITE_NAME, SITE_TAGLINE } from './lib/site';
import { NOT_FOUND, NOT_IMPLEMENTED } from './lib/status';
import { useMobileNav } from './lib/useMobileNav';
import { useProgress } from './lib/useProgress';
import Home from './screens/Home';
import LessonScreen from './screens/LessonScreen';
import StatusPage from './screens/StatusPage';

const PAGE_TITLES: Record<PageName, string> = { plan: '計画 (Gantt)', review: '復習', progress: '進捗', glossary: '用語集', settings: '設定' };

/** 画面の題 (ブラウザのタブと検索結果に出る)。ホームは null */
export function titleOf(route: Route): string | null {
  if (route.name === 'page') return PAGE_TITLES[route.page];
  if (route.name === 'course') return COURSES.find((c) => c.id === route.course)?.title ?? null;
  if (route.name === 'lesson') return findLesson(route.lessonId)?.title ?? 'ページが見つかりません';
  if (route.name === 'notFound') return 'ページが見つかりません';
  return null;
}

export default function App() {
  const { route, nav } = useRoute();
  const title = titleOf(route);
  const [navOpen, setNavOpen] = useMobileNav(nav);
  const [progress, updateProgress] = useProgress();
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ガントチャートで計画する ${SITE_TAGLINE}`;
  }, [title]);

  let screen;
  if (route.name === 'page') screen = <StatusPage title={PAGE_TITLES[route.page]} request={`GET /${route.page}`} status={NOT_IMPLEMENTED} />;
  else if (route.name === 'course') screen = <StatusPage title={title ?? ''} request={`GET /course/${route.course}`} status={NOT_IMPLEMENTED} />;
  else if (route.name === 'lesson') {
    const lesson = findLesson(route.lessonId);
    // nav を key にして、同じレッスンのリンクを押し直したときも 1 問目から始める
    screen = lesson ? (
      <LessonScreen key={`${lesson.id}-${nav}`} lesson={lesson} progress={progress} updateProgress={updateProgress} />
    ) : (
      <StatusPage title={title ?? ''} request={`GET ${window.location.pathname}`} status={NOT_FOUND} />
    );
  } else if (route.name === 'notFound') screen = <StatusPage title={title ?? ''} request={`GET ${window.location.pathname}`} status={NOT_FOUND} />;
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
