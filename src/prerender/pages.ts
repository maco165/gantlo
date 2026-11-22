// 書き出すページの一覧 (道・題・説明・本文)。画面と同じデータ (経路・コース・レッスン・題の正本) から作る。
// scripts/prerender.mjs が npm run build のあとに読み、dist/<道>/index.html を書く。tests/meta.test.ts も同じものを見る。
// 画面の JS には入らない (src/main.tsx からは読まない)。
import { SORTED } from '../content/glossary';
import { LESSONS, findLesson } from '../content/index';
import type { Lesson } from '../content/types';
import type { GlossaryTerm } from '../lib/glossary';
import { documentTitle, lessonDocumentTitle, PAGE_TITLES } from '../lib/pageMeta';
import { BASE, COURSES, courseHref, homeHref, lessonHref, pageHref, parseRoute, type PageName } from '../lib/route';
import { COURSE_EMPTY, COURSE_LEADS, LESSON_LIST_HEADING } from '../lib/courses';
import { ABOUT_ISSUE, ABOUT_LEAD, ABOUT_NOTES, ABOUT_SOURCE, LICENSE_NAME } from '../lib/about';
import { NEW_ISSUE_URL, ORIGIN, REPO_URL, SITE_NAME, SITE_TAGLINE } from '../lib/site';
import { breadcrumbs, type Crumb } from '../lib/breadcrumbs';
import { EXAM_MINUTES, EXAM_PER_WEEK, EXAM_TOTAL, EXAM_WEEKS, PASS_MARK, PASS_MARK_NOTE, examBank, weekOf } from '../lib/exam';
import { kindLabel } from '../lib/questionKind';
import { ENDPOINTS, HOSTS, STATUS_CODES } from '../lib/tryApi';
import { STAGES } from '../content/stages';
import type { Question } from '../content/types';
import { introHtml } from './intro';

// 公開の場所の正本は lib/site.ts (誤りの報告のリンクも同じ URL を使う)
export { ORIGIN };

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
  /** head に入れる構造化データ (JSON-LD の @graph の中身)。html.ts が script にして入れる */
  jsonLd?: readonly Record<string, unknown>[];
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
  exam: 'HTTP・DNS・TLS・REST・OAuth 2.0・JWT を学ぶ本編 4 週の総まとめの模擬試験。各週 10 問ずつ 40 問を 60 分で解き、合格の目安は 75% 以上。週ごとの正答率と読み直すレッスンを出します。',
  progress: '正答率・この 7 日の XP・コースごとの進み具合・旅の 8 段の学習状況を見る gantlo の進捗の画面。記録はブラウザの localStorage にだけ残り、サーバーには送りません。',
  glossary: 'HTTP・URI・JSON・DNS・TLS・REST・OAuth など API の基礎の 11 の規格と、gantlo の問題に出る用語を、RFC などの一次情報の出典付きで短くまとめた用語集。',
  settings: 'gantlo の学び方の設定の画面。設定はブラウザの localStorage にだけ残り、サーバーには送りません。',
  try: 'HTTP のメソッド・ステータスコード・ヘッダーと CORS を、ブラウザから公開の API (httpbin.org・api.github.com) に本物の要求を送って確かめる gantlo の画面。Cookie は送りません。',
  about: 'gantlo がどんなサイトかと、ソースコードの置き場所・問題の誤りの知らせ方・記録の置き場所・AI に聞くリンク・問題の出典・ライセンスをまとめたページ。',
};

const HOME_DESCRIPTION =
  'gantlo は API と HTTP の基礎 (HTTP・URI・DNS・TLS・REST・OAuth) を、curl や HTTP の穴埋め・並べ替えの問題で学ぶサイト。コースを選ぶとガントチャートで計画し、進捗はブラウザに残ります。';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** 説明は検索の結果で切られない長さに収める (末尾は …) */
export const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// href も escape する (用語集の出典の URL などデータから来る値が属性を閉じないように)
const a = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const aExternal = (href: string, text: string) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const back = `<p>${a(homeHref, `${SITE_NAME} のホーム`)}</p>`;
/** BASE からの相対の道 (ディレクトリの名前に使う) */
const rel = (href: string) => href.slice(BASE.length);
const titleOfPath = (href: string) => documentTitle(parseRoute(href));

/** 種類ごとの問題の数 (例: 4 択 3 問・並べ替え 1 問)。並びは最初に出た順 */
export function kindSummary(questions: readonly Question[]): string {
  const counts = new Map<string, number>();
  for (const q of questions) counts.set(kindLabel(q), (counts.get(kindLabel(q)) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${k} ${n} 問`).join('・');
}

/** 文字の順 (並べ替えの項目と 4 択の選択肢を、データの順 = 正しい順や正解の位置を漏らさずに書くため) */
const byText = <T extends { text: string }>(xs: readonly T[]) => [...xs].sort((x, y) => x.text.localeCompare(y.text, 'ja'));

/**
 * 並べ替えの項目を本文に書く並び。文字の順にし、それがたまたま正しい順と同じなら、1 つずらす
 * (先頭を末尾へ。2 項目以上なら必ず正しい順と違う並びになる)
 */
export function pageOrderItems(q: Extract<Question, { kind: 'order' }>): { id: string; text: string }[] {
  const sorted = byText(q.items);
  const same = sorted.length >= 2 && sorted.every((it, i) => it.id === q.answer[i]);
  return same ? [...sorted.slice(1), sorted[0]] : sorted;
}

/**
 * 問題 1 つの本文。画面で答える前に見えるもの (種類・問題文・空欄を伏せたコード・選択肢・並べる項目・実習の手順) だけを書き、
 * 正解・解説・出典・実習で観察できること (expected) は書かない。選択肢と項目は文字の順に並べ替える
 * (データの順は並べ替えの正しい順で、画面では混ぜて出すため。文字の順が正しい順と同じなら 1 つずらす)
 */
export function questionHtml(q: Question): string {
  const parts = [`<p>${esc(q.prompt)} (${esc(kindLabel(q))})</p>`];
  const code = (text: string) => `<pre><code>${esc(text.replaceAll('{{blank}}', '____'))}</code></pre>`;
  if (q.kind === 'command' || q.kind === 'http') parts.push(code(q.code));
  if (q.kind === 'choice') {
    if (q.code) parts.push(code(q.code.text));
    parts.push(`<ul>${(q.fixedOrder ? q.choices : byText(q.choices)).map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>`);
  }
  if (q.kind === 'order') parts.push(`<p>並べる項目 (順不同):</p><ul>${pageOrderItems(q).map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`);
  if (q.kind === 'lab') parts.push(`<ol>${q.steps.map((s) => `<li>${esc(s.text)}${s.command ? code(s.command) : ''}</li>`).join('')}</ol>`);
  return `<li>${parts.join('')}</li>`;
}

/** 模擬試験の本文 (形式と範囲)。数は src/lib/exam.ts の正本から書く */
export function examBody(lessons: readonly Lesson[] = LESSONS): string[] {
  const bank = examBank(lessons);
  return [
    '<h2>形式</h2>',
    `<ul><li>問題の数: ${EXAM_TOTAL} 問 (本編の ${EXAM_WEEKS.length} 週から各週 ${EXAM_PER_WEEK} 問ずつ、重ならずに選ぶ)</li><li>時間: ${EXAM_MINUTES} 分。時間が切れたら、答えていない問題は不正解として採点する</li><li>合格の目安: 正答率 ${Math.round(PASS_MARK * 100)}% 以上 (${Math.ceil(EXAM_TOTAL * PASS_MARK)} 問以上)。${PASS_MARK_NOTE}</li><li>解いている間は正誤を見せず、最後にまとめて採点し、週ごとの正答率と読み直すレッスンを出す</li><li>問題の種類は穴埋め・4 択・並べ替え。採点しない実習は出さない。選択肢と項目の並びは毎回混ぜる</li></ul>`,
    '<h2>範囲</h2>',
    ...EXAM_WEEKS.map(({ week, title }) => {
      const own = lessons.filter((l) => weekOf(l) === week);
      const n = bank.filter((b) => b.week === week).length;
      return `<h3>第 ${week} 週: ${esc(title)} (出題の元 ${n} 問)</h3><ul>${own.map((l) => `<li>${a(lessonHref(l.id), l.title)}</li>`).join('')}</ul>`;
    }),
  ];
}

/** 試す画面の本文 (何を送れるか・何が見えるか・送らないもの)。送り先の一覧は src/lib/tryApi.ts の正本から書く */
export function tryBody(): string[] {
  return [
    '<h2>送れる要求</h2>',
    `<ul>${ENDPOINTS.map((e) => `<li><code>${esc(`${e.methods.join('・')} ${HOSTS[e.host].origin}${e.hasCode ? `${e.path}{コード}` : e.path}`)}</code>: ${esc(e.note)}</li>`).join('')}</ul>`,
    `<p>ステータスコードは ${STATUS_CODES.join('・')} から選べます。リクエストヘッダーは Accept (CORS の safelist にある) と X-Gantlo-Try (safelist に無いので、ブラウザが先に OPTIONS の preflight を送る) を付け外しできます。</p>`,
    '<h2>見えるもの</h2>',
    '<p>本物のステータスコード、ブラウザが JS から読める応答ヘッダー (CORS の safelist の 7 つと、相手が Access-Control-Expose-Headers で公開した名前) と、本文です。読めないヘッダー (Date・Server など) は、届いていても読めないことを説明します。CORS で弾かれた・相手が止まっている・オフラインのときは、何が起きたかを説明します。</p>',
    '<h2>送らないもの</h2>',
    '<p>要求はあなたのブラウザから外のサービスに直に送られ、送るのはボタンを押したときだけです。Cookie や HTTP 認証 (credentials: omit) と Referer は送りません。学んだ記録も送りません。送り先には、あなたの IP アドレスと Origin ヘッダーが見えます。</p>',
  ];
}

/** パンくずの本文 (画面の src/components/Breadcrumbs.tsx と同じ形。並びの正本は src/lib/breadcrumbs.ts) */
export function crumbsHtml(crumbs: readonly Crumb[]): string {
  const items = crumbs.map((c, i) => `<li>${i < crumbs.length - 1 ? a(c.href, c.name) : `<span aria-current="page">${esc(c.name)}</span>`}</li>`).join('');
  return `<nav class="crumbs" aria-label="パンくずリスト"><ol>${items}</ol></nav>`;
}

/** 道 (BASE からの絶対の道) を公開の URL にする */
const absUrl = (href: string) => `${ORIGIN}${href}`;

/** JSON-LD の BreadcrumbList。項目の URL は絶対で、最後が canonical */
export function breadcrumbLd(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absUrl(c.href) })),
  };
}

/** 作り手 (Course の provider)。個人のサイトなので、サイトそのものを名前と URL で書く */
const PROVIDER = { '@type': 'Organization', name: SITE_NAME, url: absUrl(homeHref), sameAs: REPO_URL };

/** 語の出てくるレッスンへのリンク (画面の用語集の「出てくるレッスン」と同じ並びと名前) */
function termLessons(t: GlossaryTerm): string {
  const ls = t.lessons.map((id) => findLesson(id)).filter((l) => l !== undefined);
  const courseTitle = (id: string) => COURSES.find((c) => c.id === id)?.title ?? id;
  return ls.length ? ` 出てくるレッスン: ${ls.map((l) => a(lessonHref(l.id), `${courseTitle(l.course)} ${l.title}`)).join('・')}` : '';
}

/** レッスンに出てくる用語 (用語集の語の「出てくるレッスン」の逆向き)。用語集の一覧の語の位置へリンクする */
export function lessonTermsHtml(lessonId: string, sorted: { standards: readonly GlossaryTerm[]; others: readonly GlossaryTerm[] } = SORTED): string[] {
  const ts = [...sorted.standards, ...sorted.others].filter((t) => t.lessons.includes(lessonId));
  return ts.length ? ['<h2>出てくる用語</h2>', `<ul>${ts.map((t) => `<li>${a(`${pageHref('glossary')}#term-${t.id}`, t.term)}</li>`).join('')}</ul>`] : [];
}

/** 用語集の本文 (検索に載せるので、画面と同じ語・説明・出典を書く。画面を描くと React が置き換える) */
export function glossaryBody(sorted: { standards: readonly GlossaryTerm[]; others: readonly GlossaryTerm[] } = SORTED): string[] {
  const dl = (terms: readonly GlossaryTerm[]) =>
    `<dl>${terms
      .map(
        (t) =>
          `<dt id="term-${t.id}">${esc(t.term)}${t.aliases?.length ? ` (${esc(t.aliases.join(' · '))})` : ''}</dt><dd>${esc(t.description)} 出典: ${t.sources.map((s) => a(s.url, s.label)).join('・')}${termLessons(t)}</dd>`,
      )
      .join('')}</dl>`;
  return ['<h2>11 の規格</h2>', dl(sorted.standards), '<h2>問題に出る用語</h2>', dl(sorted.others)];
}

/** このサイトについての本文 (画面と同じ文。正本は src/lib/about.ts) */
export function aboutBody(): string[] {
  return [
    ...ABOUT_LEAD.map((p) => `<p>${esc(p)}</p>`),
    '<h2>ソースコード</h2>',
    `<p>${esc(ABOUT_SOURCE)} ${aExternal(REPO_URL, 'GitHub のリポジトリ')}</p>`,
    '<h2>問題の誤りを見つけたら</h2>',
    `<p>${esc(ABOUT_ISSUE)} ${a(NEW_ISSUE_URL, 'Issue を書く')}</p>`,
    '<h2>知っておくこと</h2>',
    `<dl>${ABOUT_NOTES.map((n) => `<dt>${esc(n.label)}</dt><dd>${esc(n.text)}</dd>`).join('')}<dt>ライセンス</dt><dd>${a(`${REPO_URL}/blob/main/LICENSE`, LICENSE_NAME)}</dd></dl>`,
  ];
}

/** レッスンの紹介の文 (コース・問題の数と種類・旅の段)。ページごとに違う中身だけで作る */
function lessonLead(l: Lesson, courseTitle: string): string {
  const stage = STAGES.find((s) => s.id === l.stage);
  const week = weekOf(l);
  return [
    `${courseTitle}のレッスン。全 ${l.questions.length} 問 (${kindSummary(l.questions)})。`,
    stage ? `リクエストの旅の「${stage.step}」の段 (${stage.name}、主な公式文書は ${stage.spec}) を扱います。` : '',
    week ? `本編の第 ${week} 週で、模擬試験の範囲です。` : '',
  ].join('');
}

/** 同じコースの前後のレッスンへのリンク */
function neighbors(l: Lesson, lessons: readonly Lesson[]): string[] {
  const own = lessons.filter((x) => x.course === l.course);
  const i = own.findIndex((x) => x.id === l.id);
  const items = [i > 0 ? `<li>前のレッスン: ${a(lessonHref(own[i - 1].id), own[i - 1].title)}</li>` : '', i < own.length - 1 ? `<li>次のレッスン: ${a(lessonHref(own[i + 1].id), own[i + 1].title)}</li>` : ''].join('');
  return items ? ['<h2>前後のレッスン</h2>', `<ul>${items}</ul>`] : [];
}

/** すべてのページ。順は sitemap の順 (ホーム → メニューの画面 → コース → レッスン)。lessons はテストで差し替える */
export function sitePages(lessons: readonly Lesson[] = LESSONS): SitePage[] {
  const pages: SitePage[] = [];
  pages.push({
    path: '',
    title: titleOfPath(homeHref),
    description: HOME_DESCRIPTION,
    jsonLd: [{ '@type': 'WebSite', name: SITE_NAME, alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`, url: absUrl(homeHref), description: HOME_DESCRIPTION, inLanguage: 'ja' }],
    body: [
      // 画面のホームと同じ見出し
      `<h1>${esc(`${SITE_NAME} — ${SITE_TAGLINE}`)}</h1>`,
      '<p>gantlo は、ブラウザに URL を打ってから画面が出るまでの「リクエストの旅」に沿って、API と HTTP の基礎の規格を学ぶ学習サイトです。名前は、ガントチャートと、1969 年に ARPANET で最初に届いた 2 文字「lo」から取りました。</p>',
      '<h2>コース</h2>',
      `<ul>${COURSES.map((c) => `<li>${a(courseHref(c.id), c.title)}: ${esc(COURSE_LEADS[c.id])}</li>`).join('')}</ul>`,
      '<h2>画面</h2>',
      `<ul>${(Object.keys(PAGE_TITLES) as PageName[]).map((p) => `<li>${a(pageHref(p), PAGE_TITLES[p])}</li>`).join('')}</ul>`,
      '<p>進み具合はブラウザの localStorage にだけ残り、サーバーには送りません。表示には JavaScript を使います。</p>',
      `<p>${aExternal(REPO_URL, 'GitHub のリポジトリ')}</p>`,
    ].join('\n'),
  });

  for (const p of Object.keys(PAGE_TITLES) as PageName[]) {
    const crumbs = breadcrumbs({ name: 'page', page: p })!;
    const url = absUrl(pageHref(p));
    const terms = [...SORTED.standards, ...SORTED.others];
    pages.push({
      path: rel(pageHref(p)),
      title: titleOfPath(pageHref(p)),
      description: PAGE_DESCRIPTIONS[p],
      jsonLd: [
        breadcrumbLd(crumbs),
        ...(p === 'glossary'
          ? [
              {
                '@type': 'DefinedTermSet',
                name: PAGE_TITLES.glossary,
                description: PAGE_DESCRIPTIONS.glossary,
                url,
                inLanguage: 'ja',
                hasDefinedTerm: terms.map((t) => ({ '@type': 'DefinedTerm', name: t.term, description: t.description, url: `${url}#term-${t.id}`, inDefinedTermSet: url })),
              },
            ]
          : []),
      ],
      body: [crumbsHtml(crumbs), `<h1>${esc(PAGE_TITLES[p])}</h1>`, `<p>${esc(PAGE_DESCRIPTIONS[p])}</p>`, ...(p === 'glossary' ? glossaryBody() : []), ...(p === 'about' ? aboutBody() : []), ...(p === 'exam' ? examBody(lessons) : []), ...(p === 'try' ? tryBody() : []), back].join('\n'),
      noindex: PERSONAL_PAGES.includes(p),
    });
  }

  for (const c of COURSES) {
    const ls = lessons.filter((l) => l.course === c.id);
    const crumbs = breadcrumbs({ name: 'course', course: c.id })!;
    pages.push({
      path: rel(courseHref(c.id)),
      title: titleOfPath(courseHref(c.id)),
      description: clip(`${c.title}のコース。${COURSE_LEADS[c.id]}`),
      jsonLd: [
        breadcrumbLd(crumbs),
        {
          '@type': 'Course',
          name: c.title,
          description: COURSE_LEADS[c.id],
          url: absUrl(courseHref(c.id)),
          inLanguage: 'ja',
          isAccessibleForFree: true,
          provider: PROVIDER,
          hasPart: ls.map((l) => ({ '@type': 'LearningResource', name: l.title, url: absUrl(lessonHref(l.id)) })),
        },
      ],
      body: [
        crumbsHtml(crumbs),
        `<h1>${esc(c.title)}</h1>`,
        `<p>${esc(COURSE_LEADS[c.id])}</p>`,
        ...(ls.length > 0 ? [`<p>${ls.length} レッスン・計 ${ls.reduce((n, l) => n + l.questions.length, 0)} 問 (${esc(kindSummary(ls.flatMap((l) => l.questions)))})。</p>`] : []),
        // 見出しと空のときの文は画面 (CourseScreen・LessonNetwork) と同じ。一覧は画面の表と同じ順 (コースのレッスンの順)。
        // レッスンごとに問題の数と種類、最初の問題文を添える (JS なしでも、何を問うレッスンかが分かるように)
        `<h2>${esc(LESSON_LIST_HEADING)}</h2>`,
        ls.length > 0
          ? `<ol>${ls.map((l) => `<li>${a(lessonHref(l.id), l.title)} (${esc(kindSummary(l.questions))})<br>最初の問題: ${esc(l.questions[0].prompt)}</li>`).join('')}</ol>`
          : `<p>${esc(COURSE_EMPTY)}</p>`,
        back,
      ].join('\n'),
    });
  }

  for (const l of lessons) {
    const course = COURSES.find((c) => c.id === l.course);
    const courseTitle = course?.title ?? l.course;
    const crumbs = breadcrumbs({ name: 'lesson', lessonId: l.id }, l)!;
    // 問題文を続けて入れる (1 問目が短いレッスンでも、説明が短くなりすぎないように)。120 字で切る
    const description = clip(`${courseTitle}のレッスン「${l.title}」(${l.questions.length} 問)。${l.questions.map((q) => q.prompt).join(' ')}`);
    pages.push({
      path: rel(lessonHref(l.id)),
      // 画面のタブ (documentTitle) と同じ題。差し替えたレッスンでも引けるよう、レッスンから直に付ける
      title: lessonDocumentTitle(l),
      description,
      jsonLd: [
        breadcrumbLd(crumbs),
        {
          '@type': 'LearningResource',
          name: l.title,
          description,
          url: absUrl(lessonHref(l.id)),
          inLanguage: 'ja',
          learningResourceType: 'Quiz',
          isAccessibleForFree: true,
          ...(course ? { isPartOf: { '@type': 'Course', name: course.title, url: absUrl(courseHref(course.id)) } } : {}),
        },
      ],
      body: [
        crumbsHtml(crumbs),
        // 見出しはレッスンの題 (画面の h1 は 1 問目の問題文だが、ページの見出しとしては題のほうが合う)
        `<h1>${esc(l.title)}</h1>`,
        `<p>${esc(lessonLead(l, courseTitle))}</p>`,
        // 問題の前に読む要点 (画面でも 1 問目の前に出す)
        ...introHtml(l.intro),
        // 答える前に見えるものまでを書き、答えと解説は書かない (画面でも答えるまで出さないため)
        '<h2>問題</h2>',
        `<ol>${l.questions.map(questionHtml).join('')}</ol>`,
        ...lessonTermsHtml(l.id),
        ...neighbors(l, lessons),
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
