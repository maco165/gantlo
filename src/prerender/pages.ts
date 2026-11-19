// 書き出すページの一覧 (道・題・説明・本文)。画面と同じデータ (経路・コース・レッスン・題の正本) から作る。
// scripts/prerender.mjs が npm run build のあとに読み、dist/<道>/index.html を書く。tests/meta.test.ts も同じものを見る。
// 画面の JS には入らない (src/main.tsx からは読まない)。
import { LESSONS } from '../content/index';
import type { Lesson } from '../content/types';
import { documentTitle, PAGE_TITLES, withSite } from '../lib/pageMeta';
import { BASE, COURSES, courseHref, homeHref, lessonHref, pageHref, parseRoute, type CourseId, type PageName } from '../lib/route';
import { REPO_URL, SITE_NAME, SITE_TAGLINE } from '../lib/site';

/** 公開の場所 (canonical・og:url・sitemap の URL の頭) */
export const ORIGIN = 'https://maco165.github.io';

export type SitePage = {
  /** 道 (BASE からの相対。ホームは ''、ほかは末尾 /) */
  path: string;
  /** <title> */
  title: string;
  /** meta description (og:description も同じ) */
  description: string;
  /** JS を動かさない読み手向けの本文 (#root の中身)。画面を描くと React が置き換える */
  body: string;
  /** 検索に載せない (meta robots noindex を付け、sitemap から外す) */
  noindex?: boolean;
  /** false なら canonical と og:url を外す (404.html。どの URL の写しでもないため) */
  canonical?: false;
};

/**
 * 一人ひとりの記録を見る・変える画面。中身はブラウザごとに違い、書き出す HTML は見出しと説明だけになるので、
 * 直接開けるようにだけして検索には載せない (kcna-dojo の復習・進捗・設定と同じ扱い)
 */
export const PERSONAL_PAGES: readonly PageName[] = ['plan', 'review', 'progress', 'settings'];

/** 画面ごとの説明。画面ができる前の名前の約束を書かない (準備中と書くと、できたあとに古くなる) */
const PAGE_DESCRIPTIONS: Record<PageName, string> = {
  plan: '学ぶコースを選んで学ぶ順に並べると、レッスンの数を帯の長さにしたガントチャートで計画を引く gantlo の画面。期限は持たず、済んだ記録は組み直しても残ります。',
  review: '間違えた問題を、日をおいて解き直す gantlo の復習の画面。答えの記録はブラウザの localStorage にだけ残り、サーバーには送りません。',
  progress: 'レッスンの完了・XP・連続日数など、gantlo で学んだ記録を見る進捗の画面。記録はブラウザの localStorage にだけ残り、サーバーには送りません。',
  glossary: 'HTTP・URI・JSON・DNS・TLS・REST・OAuth など、gantlo の問題に出てくる API と HTTP の用語を短くまとめる用語集。',
  settings: 'gantlo の学び方の設定の画面。設定はブラウザの localStorage にだけ残り、サーバーには送りません。',
};

/** コースごとの紹介 (説明と本文の頭に使う) */
export const COURSE_LEADS: Record<CourseId, string> = {
  main: 'ブラウザに URL を打ってから画面が出るまでの「リクエストの旅」に沿って、第 1 週 HTTP・URI・JSON・MIME・UTF-8、第 2 週 DNS・TCP/IP・TLS、第 3 週 REST と OpenAPI、第 4 週 OAuth 2.0 と JWT を学ぶ本編。',
  spring: 'Spring Boot のアプリが起動する流れと、リクエストを受けて応答を返す流れを、Spring の公式文書に沿って学ぶ追加のコース。',
  'tech-history': 'インターネットと Web の技術が、どんな困りごとに答えて生まれ、今どう使われているかを「困りごと → 答え → 今」の型でたどる追加のコース。',
  'mgmt-history': 'ガントチャートを軸に、それより前と後の計画と管理の方法を「困りごと → 答え → 今」の型でたどる追加のコース。',
  security: '暗号の基本と、Web の攻撃と対策を学ぶ追加のコース。試すのは自分で用意したラボの中だけにします。',
};

const HOME_DESCRIPTION =
  'gantlo は API と HTTP の基礎 (HTTP・URI・DNS・TLS・REST・OAuth) を、curl や HTTP の穴埋め・並べ替えの問題で学ぶサイト。コースを選ぶとガントチャートで計画し、進捗はブラウザに残ります。';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** 説明は検索の結果で切られない長さに収める (末尾は …) */
export const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const a = (href: string, text: string) => `<a href="${href}">${esc(text)}</a>`;
const back = `<p>${a(homeHref, `${SITE_NAME} のホーム`)}</p>`;
/** BASE からの相対の道 (ディレクトリの名前に使う) */
const rel = (href: string) => href.slice(BASE.length);
const titleOfPath = (href: string) => documentTitle(parseRoute(href));

/** すべてのページ。順は sitemap の順 (ホーム → メニューの画面 → コース → レッスン)。lessons はテストで差し替える */
export function sitePages(lessons: readonly Lesson[] = LESSONS): SitePage[] {
  const pages: SitePage[] = [];
  pages.push({
    path: '',
    title: titleOfPath(homeHref),
    description: HOME_DESCRIPTION,
    body: [
      // 画面のホームと同じ見出し
      `<h1>${esc(`${SITE_NAME} — ${SITE_TAGLINE}`)}</h1>`,
      '<p>gantlo は、ブラウザに URL を打ってから画面が出るまでの「リクエストの旅」に沿って、API と HTTP の基礎の規格を学ぶ学習サイトです。名前は、ガントチャートと、1969 年に ARPANET で最初に届いた 2 文字「lo」から取りました。</p>',
      '<h2>コース</h2>',
      `<ul>${COURSES.map((c) => `<li>${a(courseHref(c.id), c.title)}: ${esc(COURSE_LEADS[c.id])}</li>`).join('')}</ul>`,
      '<h2>画面</h2>',
      `<ul>${(Object.keys(PAGE_TITLES) as PageName[]).map((p) => `<li>${a(pageHref(p), PAGE_TITLES[p])}</li>`).join('')}</ul>`,
      '<p>進み具合はブラウザの localStorage にだけ残り、サーバーには送りません。表示には JavaScript を使います。</p>',
      `<p><a href="${REPO_URL}">GitHub のリポジトリ</a></p>`,
    ].join('\n'),
  });

  for (const p of Object.keys(PAGE_TITLES) as PageName[]) {
    pages.push({
      path: rel(pageHref(p)),
      title: titleOfPath(pageHref(p)),
      description: PAGE_DESCRIPTIONS[p],
      body: [`<h1>${esc(PAGE_TITLES[p])}</h1>`, `<p>${esc(PAGE_DESCRIPTIONS[p])}</p>`, back].join('\n'),
      noindex: PERSONAL_PAGES.includes(p),
    });
  }

  for (const c of COURSES) {
    const ls = lessons.filter((l) => l.course === c.id);
    pages.push({
      path: rel(courseHref(c.id)),
      title: titleOfPath(courseHref(c.id)),
      description: clip(`${c.title}のコース。${COURSE_LEADS[c.id]}`),
      body: [
        `<h1>${esc(c.title)}</h1>`,
        `<p>${esc(COURSE_LEADS[c.id])}</p>`,
        '<h2>レッスン</h2>',
        ls.length > 0 ? `<ol>${ls.map((l) => `<li>${a(lessonHref(l.id), l.title)} (${l.questions.length} 問)</li>`).join('')}</ol>` : '<p>このコースのレッスンは、これから足します。</p>',
        back,
      ].join('\n'),
    });
  }

  for (const l of lessons) {
    const course = COURSES.find((c) => c.id === l.course);
    const courseTitle = course?.title ?? l.course;
    pages.push({
      path: rel(lessonHref(l.id)),
      // 画面の題 (titleOf) と同じくレッスンの題。差し替えたレッスンでも引けるよう、ここで直に付ける
      title: withSite(l.title),
      // 問題文を続けて入れる (1 問目が短いレッスンでも、説明が短くなりすぎないように)。120 字で切る
      description: clip(`${courseTitle}のレッスン「${l.title}」(${l.questions.length} 問)。${l.questions.map((q) => q.prompt).join(' ')}`),
      body: [
        `<p>${a(courseHref(l.course), courseTitle)}</p>`,
        // 見出しはレッスンの題 (画面の h1 は 1 問目の問題文だが、ページの見出しとしては題のほうが合う)
        `<h1>${esc(l.title)}</h1>`,
        // 問題文までを書き、答えと解説は書かない (画面でも答えるまで出さないため)
        '<h2>問題</h2>',
        `<ol>${l.questions.map((q) => `<li>${esc(q.prompt)}</li>`).join('')}</ol>`,
        back,
      ].join('\n'),
    });
  }
  return pages;
}

/** 知らない道に GitHub Pages が返す 404.html の中身。検索には載せない */
export const NOT_FOUND_PAGE: SitePage = {
  path: '404.html',
  title: titleOfPath(`${BASE}__not-found__/`),
  description: 'このページは見つかりません。',
  body: ['<h1>ページが見つかりません</h1>', back].join('\n'),
  noindex: true,
  canonical: false,
};

/** canonical・og:url・sitemap の URL (末尾 /) */
export const pageUrl = (path: string) => `${ORIGIN}${BASE}${path}`;
