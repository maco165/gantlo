import { AppShell } from '@astryxdesign/core/AppShell';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import jaJP from '@astryxdesign/core/locales/ja-JP.generated.js';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';
import { lazy, Suspense, useEffect } from 'react';
import AppSideNav, { AppMobileNav } from './components/AppSideNav';
import Breadcrumbs from './components/Breadcrumbs';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import MobileBar from './components/MobileBar';
import { findLessonMeta } from './content/catalog';
import { documentTitle, PAGE_TITLES, titleOf } from './lib/pageMeta';
import { useRoute } from './lib/route';
import { NOT_FOUND, NOT_IMPLEMENTED } from './lib/status';
import { useMobileNav } from './lib/useMobileNav';
import { useProgress } from './lib/useProgress';
import Home from './screens/Home';
import StatusPage from './screens/StatusPage';

// ホーム以外の画面は、開いたときに読む (最初の JS を軽くするため。用語集はそのデータ content/glossary.json も)
const About = lazy(() => import('./screens/About'));
const CourseScreen = lazy(() => import('./screens/CourseScreen'));
const Exam = lazy(() => import('./screens/Exam'));
const Glossary = lazy(() => import('./screens/Glossary'));
const Handbook = lazy(() => import('./screens/Handbook'));
const LessonPage = lazy(() => import('./screens/LessonPage'));
const Plan = lazy(() => import('./screens/Plan'));
const ProgressScreen = lazy(() => import('./screens/ProgressScreen'));
const Review = lazy(() => import('./screens/Review'));
const Settings = lazy(() => import('./screens/Settings'));

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
  else if (route.name === 'page' && route.page === 'exam') screen = <Exam key={nav} progress={progress} updateProgress={updateProgress} />;
  else if (route.name === 'page' && route.page === 'progress') screen = <ProgressScreen progress={progress} />;
  else if (route.name === 'page' && route.page === 'glossary') screen = <Glossary key={nav} />;
  else if (route.name === 'page' && route.page === 'settings') screen = <Settings key={nav} progress={progress} updateProgress={updateProgress} />;
  else if (route.name === 'page' && route.page === 'about') screen = <About />;
  else if (route.name === 'page') screen = <StatusPage title={PAGE_TITLES[route.page]} request={`GET /${route.page}`} status={NOT_IMPLEMENTED} />;
  else if (route.name === 'handbook') screen = <Handbook topic={route.topic} />;
  else if (route.name === 'course') screen = <CourseScreen key={route.course} course={route.course} progress={progress} />;
  else if (route.name === 'lesson') {
    // あるかは目録で見る (問題の本文はレッスンの画面と一緒に読む)
    screen = findLessonMeta(route.lessonId) ? (
      <LessonPage lessonId={route.lessonId} nav={nav} progress={progress} updateProgress={updateProgress} />
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
          <Breadcrumbs route={route} />
          {/* 画面の JS を読んでいる間は、読み込み中とだけ出す。見出し (h1) は画面と一緒に出す
              (見出しが出たら画面ができた、と読む人や検査を待たせないため)。key で画面ごとに待ちをやり直す。
              画面の JS を読めなければ、白紙にせず「読み込めませんでした」と読み直すボタンを出す */}
          <ChunkErrorBoundary key={route.name === 'page' ? route.page : route.name}>
            <Suspense
              fallback={
                <div className="page" aria-busy="true">
                  <Text type="supporting">読み込んでいます。</Text>
                </div>
              }
            >
              {screen}
            </Suspense>
          </ChunkErrorBoundary>
        </AppShell>
      </Theme>
    </InternationalizationProvider>
  );
}
