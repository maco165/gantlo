// 検索に届く形 (R-7)。ページごとに書き出す HTML の題・説明・canonical・本文の見出しと、sitemap.xml を確かめる。
// 前半は書き出しと同じ関数で、ページを手元で組み立てて見る (npm test だけで走る)。
// 後半は npm run build のあとの dist を見る (dist が無ければ飛ばす。CI は build のあとに npm test を走らせる)。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import type { Lesson } from '../src/content/types';
import { documentTitle, PAGE_TITLES, titleOf } from '../src/lib/pageMeta';
import { BASE, COURSES, lessonHref, parseRoute } from '../src/lib/route';
import { LESSON_LIST_HEADING } from '../src/lib/courses';
import { SITE_NAME, SITE_TAGLINE } from '../src/lib/site';
import { renderPage, sitemapXml } from '../src/prerender/html';
import { NOT_FOUND_PAGE, ORIGIN, sitePages, type SitePage } from '../src/prerender/pages';

/** 検索に載せない、一人ひとりの記録の画面 (R-7 の「全ページ」は検索に載せる全ページと読む) */
const PERSONAL = ['plan/', 'review/', 'progress/', 'settings/'];

const SITE_URL = `${ORIGIN}${BASE}`;
const template = readFileSync(join(__dirname, '../index.html'), 'utf8');
const pages = sitePages();

type Head = { title: string; description: string; canonical: string | null; ogUrl: string | null; robots: string | null; h1: string; rootText: string };
function readHead(html: string): Head {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const attr = (sel: string, name: string) => doc.querySelector(sel)?.getAttribute(name) ?? null;
  return {
    title: doc.title,
    description: attr('meta[name="description"]', 'content') ?? '',
    canonical: attr('link[rel="canonical"]', 'href'),
    ogUrl: attr('meta[property="og:url"]', 'content'),
    robots: attr('meta[name="robots"]', 'content'),
    h1: doc.querySelector('#root h1')?.textContent ?? '',
    rootText: doc.querySelector('#root')?.textContent ?? '',
  };
}

/** コースのページの一覧 (#root の ol) のリンクの順 */
const courseLessonLinks = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('#root ol a')].map((a) => a.getAttribute('href'));
/** 本文の h2 の文字 */
const courseHeadings = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('#root h2')].map((h) => h.textContent);

/** 本文の見出し。ホームは画面と同じ「gantlo — API と HTTP の基礎」、ほかは画面の題 (レッスンは題。画面の h1 は 1 問目の問題文) */
const expectedH1 = (p: SitePage) => (p.path === '' ? `${SITE_NAME} — ${SITE_TAGLINE}` : titleOf(parseRoute(`${BASE}${p.path}`)));

const expectUnique = (values: string[], label: string) => {
  const dup = values.filter((v, i) => values.indexOf(v) !== i);
  expect(dup, `${label} が重なっている`).toEqual([]);
};

describe('書き出すページの一覧', () => {
  it('ホーム・メニューの画面・全コース・全レッスンがそろう', () => {
    const expected = ['', ...Object.keys(PAGE_TITLES).map((p) => `${p}/`), ...COURSES.map((c) => `course/${c.id}/`), ...LESSONS.map((l) => `lesson/${l.id}/`)];
    expect(pages.map((p) => p.path).sort()).toEqual([...expected].sort());
  });
});

describe('ページごとの HTML (手元で組み立てる)', () => {
  const heads = pages.map((p) => ({ page: p, head: readHead(renderPage(template, p)) }));

  it('title・description・canonical がページごとに重ならない', () => {
    expectUnique(heads.map((h) => h.head.title), 'title');
    expectUnique(heads.map((h) => h.head.description), 'description');
    expectUnique(heads.map((h) => h.head.canonical ?? ''), 'canonical');
  });

  it('canonical と og:url は # の無い公開の URL で、末尾が /', () => {
    for (const { page, head } of heads) {
      expect(head.canonical).toBe(`${SITE_URL}${page.path}`);
      expect(head.ogUrl).toBe(head.canonical);
      expect(head.canonical).toMatch(/^https:\/\/maco165\.github\.io\/gantlo\/(?:[a-z0-9-]+\/)*$/);
    }
  });

  it('title は画面のタブ (documentTitle) と同じで、description は 50〜120 字', () => {
    for (const { page, head } of heads) {
      expect(head.title).toBe(page.title);
      expect(head.title, page.path).toBe(documentTitle(parseRoute(`${BASE}${page.path}`)));
      expect(head.description.length, page.path).toBeGreaterThanOrEqual(50);
      expect(head.description.length, page.path).toBeLessThanOrEqual(120);
    }
  });

  it('一人ひとりの記録の画面 (plan・review・progress・settings) だけ noindex で、ほかは検索に載せる', () => {
    for (const { page, head } of heads) expect(head.robots, page.path).toBe(PERSONAL.includes(page.path) ? 'noindex' : null);
    expect(heads.filter((h) => h.head.robots === 'noindex').map((h) => h.page.path).sort()).toEqual([...PERSONAL].sort());
  });

  it('本文の見出し (h1) が JS なしの HTML にあり、画面の見出しと同じ (レッスンは題)', () => {
    for (const { page, head } of heads) expect(head.h1, page.path).toBe(expectedH1(page));
  });

  it('コースのページは、画面と同じ一覧の見出し (Network) の下に、そのコースのレッスンへのリンクを画面と同じ順に持つ', () => {
    for (const c of COURSES) {
      const page = pages.find((p) => p.path === `course/${c.id}/`)!;
      expect(courseLessonLinks(renderPage(template, page)), c.id).toEqual(LESSONS.filter((l) => l.course === c.id).map((l) => lessonHref(l.id)));
      expect(courseHeadings(renderPage(template, page)), c.id).toEqual([LESSON_LIST_HEADING]);
    }
  });

  it('レッスンのページは問題文を持ち、答えの解説は持たない (画面でも答えるまで出さない)', () => {
    for (const l of LESSONS) {
      const { head } = heads.find((h) => h.page.path === `lesson/${l.id}/`)!;
      for (const q of l.questions) {
        expect(head.rootText).toContain(q.prompt);
        expect(head.rootText).not.toContain(q.explanation);
      }
    }
  });

  it('レッスンの題と問題文の < > & を、本文 (h1・コースの一覧・問題の一覧) でも文字として書く', () => {
    const odd = { id: 'x-l1', title: '<b>A & B</b>', course: 'main', questions: [{ id: 'x-q1', kind: 'choice', prompt: '<img src=x onerror=alert(1)> & 1 < 2', explanation: 'e', sources: [], choices: [], answer: '' }] } as unknown as Lesson;
    const all = sitePages([odd]);
    const lessonHtml = renderPage(template, all.find((p) => p.path === 'lesson/x-l1/')!);
    const courseHtml = renderPage(template, all.find((p) => p.path === 'course/main/')!);
    expect(lessonHtml).toContain('<h1>&lt;b&gt;A &amp; B&lt;/b&gt;</h1>');
    expect(lessonHtml).toContain('<li>&lt;img src=x onerror=alert(1)&gt; &amp; 1 &lt; 2</li>');
    expect(courseHtml).toContain('>&lt;b&gt;A &amp; B&lt;/b&gt;</a>');
    for (const html of [lessonHtml, courseHtml]) {
      expect(html).not.toContain('<b>A');
      expect(html).not.toContain('<img src=x');
    }
    expect(readHead(lessonHtml).h1).toBe('<b>A & B</b>');
  });

  it('404.html は検索に載せず、canonical を持たない', () => {
    const head = readHead(renderPage(template, NOT_FOUND_PAGE));
    expect(head.robots).toBe('noindex');
    expect(head.canonical).toBeNull();
    expect(head.ogUrl).toBeNull();
    expect(head.h1).toBe('ページが見つかりません');
  });

  it('< " & と $1 $& を、そのままの文字として書く (置き換えの記号として読まない)', () => {
    const html = renderPage(template, { path: 'x/', title: 'a<b>"c"&', description: 'price $1 and $& and $$', body: '<pre>echo $1 $&</pre>' });
    expect(html).toContain('<title>a&lt;b&gt;&quot;c&quot;&amp;</title>');
    // 説明・og:description・canonical の場所ごとに見る (どれか 1 つに文字が残るだけで通らないように)
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('price $1 and $& and $$');
    expect(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe('price $1 and $& and $$');
    expect(doc.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(html).toContain('<pre>echo $1 $&</pre>');
  });

  it('型 (index.html) の形が変わって置き換える場所が無ければ止める (黙って全ページの canonical がホームのまま公開しない)', () => {
    const broken = template.replace('<link rel="canonical"', '<link data-x rel="canonical"');
    expect(() => renderPage(broken, pages[1])).toThrow(/canonical/);
  });
});

describe('sitemap.xml', () => {
  const xml = sitemapXml(pages);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('検索に載せる全ページの # の無い URL を 1 回ずつ持ち、lastmod を付けない', () => {
    expect(locs).toEqual(pages.filter((p) => !PERSONAL.includes(p.path)).map((p) => `${SITE_URL}${p.path}`));
    for (const p of PERSONAL) expect(locs).not.toContain(`${SITE_URL}${p}`);
    // このサイトについての画面は検索に載せる
    expect(locs).toContain(`${SITE_URL}about/`);
    expectUnique(locs, 'sitemap の URL');
    for (const loc of locs) expect(loc).not.toContain('#');
    expect(xml).not.toContain('lastmod');
    expect(xml).not.toContain('404');
  });
});

const DIST = join(__dirname, '../dist');
describe.skipIf(!existsSync(join(DIST, 'sitemap.xml')))('npm run build のあとの dist', () => {
  const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

  it('ページごとに dist/<道>/index.html があり、題・説明・canonical・見出し・noindex がそのページのもの', () => {
    for (const page of pages) {
      const file = join(page.path, 'index.html');
      expect(existsSync(join(DIST, file)), file).toBe(true);
      const head = readHead(read(file));
      expect(head.title, file).toBe(page.title);
      expect(head.description, file).toBe(page.description);
      expect(head.canonical, file).toBe(`${SITE_URL}${page.path}`);
      expect(head.h1, file).toBe(expectedH1(page));
      expect(head.robots, file).toBe(PERSONAL.includes(page.path) ? 'noindex' : null);
      // 画面の JS を読む (書き出した HTML から SPA が立ち上がる)
      expect(read(file), file).toMatch(/<script type="module" crossorigin src="\/gantlo\/assets\/index-[^"]+\.js"><\/script>/);
    }
  });

  it('コースのページ (dist/course/<id>/index.html) にも、そのコースのレッスンの一覧が順に入る', () => {
    for (const c of COURSES) {
      const want = LESSONS.filter((l) => l.course === c.id).map((l) => lessonHref(l.id));
      expect(want.length, c.id).toBeGreaterThan(0);
      expect(courseLessonLinks(read(`course/${c.id}/index.html`)), c.id).toEqual(want);
    }
  });

  it('sitemap.xml は検索に載せる全ページを持ち、robots.txt が sitemap を指し、404.html は検索に載せない', () => {
    expect(read('sitemap.xml')).toBe(sitemapXml(pages));
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
    const nf = readHead(read('404.html'));
    expect(nf.robots).toBe('noindex');
    expect(nf.canonical).toBeNull();
  });
});
