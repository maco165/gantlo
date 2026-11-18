// 検索に届く形 (R-7)。ページごとに書き出す HTML の題・説明・canonical・本文の見出しと、sitemap.xml を確かめる。
// 前半は書き出しと同じ関数で、ページを手元で組み立てて見る (npm test だけで走る)。
// 後半は npm run build のあとの dist を見る (dist が無ければ飛ばす。CI は build のあとに npm test を走らせる)。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import { PAGE_TITLES, titleOf } from '../src/lib/pageMeta';
import { BASE, COURSES, parseRoute } from '../src/lib/route';
import { SITE_NAME, SITE_TAGLINE } from '../src/lib/site';
import { renderPage, sitemapXml } from '../src/prerender/html';
import { NOT_FOUND_PAGE, ORIGIN, sitePages, type SitePage } from '../src/prerender/pages';

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

/** 画面の見出しと同じ文 (ホームは「gantlo — API と HTTP の基礎」、ほかは画面の題) */
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

  it('title は画面のタブと同じで、description は 50〜120 字', () => {
    for (const { page, head } of heads) {
      expect(head.title).toBe(page.title);
      expect(head.title.includes(SITE_NAME)).toBe(true);
      expect(head.description.length, page.path).toBeGreaterThanOrEqual(50);
      expect(head.description.length, page.path).toBeLessThanOrEqual(120);
      expect(head.robots).toBeNull();
    }
  });

  it('本文の見出し (h1) が JS なしの HTML にあり、画面の見出しと同じ', () => {
    for (const { page, head } of heads) expect(head.h1, page.path).toBe(expectedH1(page));
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

  it('404.html は検索に載せず、canonical を持たない', () => {
    const head = readHead(renderPage(template, NOT_FOUND_PAGE, { noindex: true }));
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

  it('全ページの # の無い URL を 1 回ずつ持ち、lastmod を付けない', () => {
    expect(locs).toEqual(pages.map((p) => `${SITE_URL}${p.path}`));
    expectUnique(locs, 'sitemap の URL');
    for (const loc of locs) expect(loc).not.toContain('#');
    expect(xml).not.toContain('lastmod');
    expect(xml).not.toContain('404');
  });
});

const DIST = join(__dirname, '../dist');
describe.skipIf(!existsSync(join(DIST, 'sitemap.xml')))('npm run build のあとの dist', () => {
  const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

  it('ページごとに dist/<道>/index.html があり、題・説明・canonical・見出しがそのページのもの', () => {
    for (const page of pages) {
      const file = join(page.path, 'index.html');
      expect(existsSync(join(DIST, file)), file).toBe(true);
      const head = readHead(read(file));
      expect(head.title, file).toBe(page.title);
      expect(head.description, file).toBe(page.description);
      expect(head.canonical, file).toBe(`${SITE_URL}${page.path}`);
      expect(head.h1, file).toBe(expectedH1(page));
      // 画面の JS を読む (書き出した HTML から SPA が立ち上がる)
      expect(read(file), file).toMatch(/<script type="module" crossorigin src="\/gantlo\/assets\/index-[^"]+\.js"><\/script>/);
    }
  });

  it('sitemap.xml は全ページを持ち、robots.txt が sitemap を指し、404.html は検索に載せない', () => {
    expect(read('sitemap.xml')).toBe(sitemapXml(pages));
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
    const nf = readHead(read('404.html'));
    expect(nf.robots).toBe('noindex');
    expect(nf.canonical).toBeNull();
  });
});
