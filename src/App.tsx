import { AppShell } from '@astryxdesign/core/AppShell';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import jaJP from '@astryxdesign/core/locales/ja-JP.generated.js';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';
import { lazy, Suspense, useEffect } from 'react';
import AppSideNav, { AppMobileNav } from './components/AppSideNav';
import MobileBar from './components/MobileBar';
import { findLesson } from './content/index';
import { documentTitle, PAGE_TITLES, titleOf } from './lib/pageMeta';
import { useRoute } from './lib/route';
import { NOT_FOUND, NOT_IMPLEMENTED } from './lib/status';
import { useMobileNav } from './lib/useMobileNav';
import { useProgress } from './lib/useProgress';
import About from './screens/About';
import Home from './screens/Home';
import LessonScreen from './screens/LessonScreen';
import Plan from './screens/Plan';
import ProgressScreen from './screens/ProgressScreen';
import Review from './screens/Review';
import Settings from './screens/Settings';
import StatusPage from './screens/StatusPage';

// 用語集の画面とそのデータ (content/glossary.json) は、開いたときに読む (最初の JS を軽くするため)
const Glossary = lazy(() => import('./screens/Glossary'));

export default function App() {
  const { route, nav, close } = useRoute();
  const title = titleOf(route);
  const [navOpen, setNavOpen] = useMobileNav(close);
  const [progress, updateProgress] = useProgress();
  const docTitle = documentTitle(route);
  useEffect(() => {
    document.title = docTitle;
  }, [docTitle]);

  let screen;
  if (route.name === 'page' && route.page === 'plan') screen = <Plan key={nav} progress={progress} updateProgress={updateProgress} />;
  else if (route.name === 'page' && route.page === 'review') screen = <Review key={nav} progress={progress} updateProgress={updateProgress} />;
  else if (route.name === 'page' && route.page === 'progress') screen = <ProgressScreen progress={progress} />;
  else if (route.name === 'page' && route.page === 'glossary') screen = (
      <Suspense
        fallback={
          <div className="page">
            <h1 className="page__title">{PAGE_TITLES.glossary}</h1>
            <Text type="supporting">読み込んでいます。</Text>
          </div>
        }
      >
        <Glossary key={nav} />
      </Suspense>
    );
  else if (route.name === 'page' && route.page === 'settings') screen = <Settings key={nav} progress={progress} updateProgress={updateProgress} />;
  else if (route.name === 'page' && route.page === 'about') screen = <About />;
  else if (route.name === 'page') screen = <StatusPage title={PAGE_TITLES[route.page]} request={`GET /${route.page}`} status={NOT_IMPLEMENTED} />;
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
  else screen = <Home progress={progress} />;

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
